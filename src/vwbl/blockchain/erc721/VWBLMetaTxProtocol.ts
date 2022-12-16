/* tslint:disable no-var-requires */
const Biconomy = require("@biconomy/mexa");

import { ethers } from "ethers";

import forwarder from "../../../contract/Forwarder.json";
import vwblMetaTx from "../../../contract/VWBLMetaTx.json";
import vwblMetaTxIpfs from "../../../contract/VWBLMetaTxSupportIPFS.json";
import {
  buildForwardTxRequest,
  getDataToSignForEIP712,
  getDomainSeparator,
  TxParam,
} from "../../../util/biconomyHelper";

export class VWBLNFTMetaTx {
  private biconomy: any;
  private ethersProvider: ethers.providers.Web3Provider;
  private walletProvider: ethers.providers.Web3Provider;
  private nftAddress: string;
  private forwarderAddress: string;
  private biconomyAPIKey: string;

  constructor(
    provider: any,
    providerUrl: string,
    biconomyAPIKey: string,
    walletProvider: ethers.providers.Web3Provider,
    nftAddress: string,
    forwarderAddress: string
  ) {
    const jsonRpcProvider = new ethers.providers.JsonRpcProvider(providerUrl);
    this.biconomy = new Biconomy(jsonRpcProvider, {
      walletProvider: provider,
      apiKey: biconomyAPIKey,
      debug: true,
    });
    this.ethersProvider = new ethers.providers.Web3Provider(this.biconomy);
    this.walletProvider = walletProvider;
    this.nftAddress = nftAddress;
    this.forwarderAddress = forwarderAddress;
    this.biconomyAPIKey = biconomyAPIKey;
  }

  async mintToken(
    decryptUrl: string,
    royaltiesPercentage: number,
    documentId: string,
    mintApiId: string
  ): Promise<number> {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const vwblMetaTxContract = new ethers.Contract(
      this.nftAddress,
      vwblMetaTx.abi,
      this.biconomy.getSignerByAddress(myAddress)
    );
    const { data } = await vwblMetaTxContract.populateTransaction.mint(decryptUrl, royaltiesPercentage, documentId);
    const chainId = await walletSigner.getChainId();
    const { txParam, sig, domainSeparator } = await this.constructMetaTx(myAddress, data!, chainId);
    console.log("transaction start");
    const receipt = await this.sendTransaction(txParam, sig, myAddress, domainSeparator, mintApiId, "EIP712_SIGN");
    console.log("transaction end");
    const tokenId = parseToTokenId(receipt);
    return tokenId;
  }

  async mintTokenForIPFS(
    metadataUrl: string,
    decryptUrl: string,
    royaltiesPercentage: number,
    documentId: string,
    mintApiId: string
  ): Promise<number> {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const vwblMetaTxContract = new ethers.Contract(
      this.nftAddress,
      vwblMetaTxIpfs.abi,
      this.biconomy.getSignerByAddress(myAddress)
    );
    const { data } = await vwblMetaTxContract.populateTransaction.mint(
      metadataUrl,
      decryptUrl,
      royaltiesPercentage,
      documentId
    );
    const chainId = await walletSigner.getChainId();
    const { txParam, sig, domainSeparator } = await this.constructMetaTx(myAddress, data!, chainId);
    console.log("transaction start");
    const receipt = await this.sendTransaction(txParam, sig, myAddress, domainSeparator, mintApiId, "EIP712_SIGN");
    console.log("transaction end");
    const tokenId = parseToTokenId(receipt);
    return tokenId;
  }

  async getOwnTokenIds() {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const vwblMetaTxContract = new ethers.Contract(
      this.nftAddress,
      vwblMetaTxIpfs.abi,
      this.biconomy.getSignerByAddress(myAddress)
    );
    const balance = await vwblMetaTxContract.callStatic.balanceOf(myAddress);
    return await Promise.all(
      range(Number.parseInt(balance)).map(async (i) => {
        const ownTokenId = await vwblMetaTxContract.callStatic.tokenOfOwnerByIndex(myAddress, i);
        return Number.parseInt(ownTokenId);
      })
    );
  }

  async getTokenByMinter(address: string) {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const vwblMetaTxContract = new ethers.Contract(
      this.nftAddress,
      vwblMetaTxIpfs.abi,
      this.biconomy.getSignerByAddress(myAddress)
    );
    return await vwblMetaTxContract.callStatic.getTokenByMinter(address);
  }

  async getMetadataUrl(tokenId: number) {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const vwblMetaTxContract = new ethers.Contract(
      this.nftAddress,
      vwblMetaTxIpfs.abi,
      this.biconomy.getSignerByAddress(myAddress)
    );
    return await vwblMetaTxContract.callStatic.tokenURI(tokenId);
  }

  async getOwner(tokenId: number) {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const vwblMetaTxContract = new ethers.Contract(
      this.nftAddress,
      vwblMetaTxIpfs.abi,
      this.biconomy.getSignerByAddress(myAddress)
    );
    return await vwblMetaTxContract.callStatic.ownerOf(tokenId);
  }

  async getMinter(tokenId: number) {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const vwblMetaTxContract = new ethers.Contract(
      this.nftAddress,
      vwblMetaTxIpfs.abi,
      this.biconomy.getSignerByAddress(myAddress)
    );
    return await vwblMetaTxContract.callStatic.getMinter(tokenId);
  }

  async isOwnerOf(tokenId: number) {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const owner = await this.getOwner(tokenId);
    return myAddress === owner;
  }

  async isMinterOf(tokenId: number) {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const minter = await this.getMinter(tokenId);
    return myAddress === minter;
  }

  async getFee() {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const vwblMetaTxContract = new ethers.Contract(
      this.nftAddress,
      vwblMetaTxIpfs.abi,
      this.biconomy.getSignerByAddress(myAddress)
    );
    return await vwblMetaTxContract.callStatic.getFee();
  }

  async getTokenInfo(tokenId: number) {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const vwblMetaTxContract = new ethers.Contract(
      this.nftAddress,
      vwblMetaTxIpfs.abi,
      this.biconomy.getSignerByAddress(myAddress)
    );
    return await vwblMetaTxContract.callStatic.tokenIdToTokenInfo(tokenId);
  }

  async approve(operator: string, tokenId: number, approveApiId: string): Promise<void> {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const vwblMetaTxContract = new ethers.Contract(
      this.nftAddress,
      vwblMetaTxIpfs.abi,
      this.biconomy.getSignerByAddress(myAddress)
    );
    const { data } = await vwblMetaTxContract.populateTransaction.approve(operator, tokenId);
    const chainId = await walletSigner.getChainId();
    const { txParam, sig, domainSeparator } = await this.constructMetaTx(myAddress, data!, chainId);
    console.log("transaction start");
    await this.sendTransaction(txParam, sig, myAddress, domainSeparator, approveApiId, "EIP712_SIGN");
    console.log("transaction end");
  }

  async getApproved(tokenId: number): Promise<string> {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const vwblMetaTxContract = new ethers.Contract(
      this.nftAddress,
      vwblMetaTxIpfs.abi,
      this.biconomy.getSignerByAddress(myAddress)
    );
    return await vwblMetaTxContract.callStatic.getApproved(tokenId);
  }

  async setApprovalForAll(operator: string, setApprovalForAllApiId: string): Promise<void> {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const vwblMetaTxContract = new ethers.Contract(
      this.nftAddress,
      vwblMetaTxIpfs.abi,
      this.biconomy.getSignerByAddress(myAddress)
    );
    const { data } = await vwblMetaTxContract.populateTransaction.setApprovalForAll(operator);
    const chainId = await walletSigner.getChainId();
    const { txParam, sig, domainSeparator } = await this.constructMetaTx(myAddress, data!, chainId);
    console.log("transaction start");
    await this.sendTransaction(txParam, sig, myAddress, domainSeparator, setApprovalForAllApiId, "EIP712_SIGN");
    console.log("transaction end");
  }

  async isApprovedForAll(owner: string, operator: string): Promise<boolean> {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const vwblMetaTxContract = new ethers.Contract(
      this.nftAddress,
      vwblMetaTxIpfs.abi,
      this.biconomy.getSignerByAddress(myAddress)
    );
    return await vwblMetaTxContract.callStatic.isApprovedForAll(owner, operator);
  }

  async safeTransfer(to: string, tokenId: number, safeTransferFromApiId: string): Promise<void> {
    const walletSigner = this.walletProvider.getSigner();
    const myAddress = await walletSigner.getAddress();
    const vwblMetaTxContract = new ethers.Contract(
      this.nftAddress,
      vwblMetaTxIpfs.abi,
      this.biconomy.getSignerByAddress(myAddress)
    );
    const { data } = await vwblMetaTxContract.populateTransaction.safeTransferFrom(myAddress, to, tokenId);
    const chainId = await walletSigner.getChainId();
    const { txParam, sig, domainSeparator } = await this.constructMetaTx(myAddress, data!, chainId);
    console.log("transaction start");
    await this.sendTransaction(txParam, sig, myAddress, domainSeparator, safeTransferFromApiId, "EIP712_SIGN");
    console.log("transaction end");
  }

  private async constructMetaTx(myAddress: string, data: string, chainId: number) {
    const gasLimit = await this.ethersProvider.estimateGas({
      to: this.nftAddress,
      from: myAddress,
      data,
    });

    const forwarderContract = new ethers.Contract(
      this.forwarderAddress,
      forwarder.abi,
      this.biconomy.getSignerByAddress(myAddress)
    );
    const batchNonce = await forwarderContract.getNonce(myAddress, 0);
    const txParam: TxParam = buildForwardTxRequest(
      myAddress,
      this.nftAddress,
      Number(gasLimit.toNumber().toString()),
      batchNonce,
      data
    );
    const domainSeparator = getDomainSeparator(this.forwarderAddress, chainId);
    const dataToSign = getDataToSignForEIP712(txParam, this.forwarderAddress, chainId);
    const sig = await this.walletProvider.send("eth_signTypedData_v3", [myAddress, dataToSign]);

    return { txParam, sig, domainSeparator };
  }

  private async sendTransaction(
    request: TxParam,
    sig: any,
    myAddress: string,
    domainSeparator: string,
    methodApiId: string,
    signatureType: string
  ): Promise<ethers.providers.TransactionReceipt> {
    const params = [request, domainSeparator, sig];

    try {
      const res = await fetch(`https://api.biconomy.io/api/v2/meta-tx/native`, {
        method: "POST",
        headers: {
          "x-api-key": this.biconomyAPIKey,
          "Content-Type": "application/json;charset=utf-8",
        },
        body: JSON.stringify({
          to: this.nftAddress,
          apiId: methodApiId,
          params: params,
          from: myAddress,
          signatureType: signatureType,
        }),
      });
      const txHash = (await res.json()).txHash;
      const receipt = await this.ethersProvider.waitForTransaction(txHash);
      console.log("txHash:", txHash);
      return receipt;
    } catch (error) {
      throw new Error("post meta tx error");
    }
  }
}

const range = (length: number) => {
  return Array.from(Array(length).keys());
};

const parseToTokenId = (receipt: ethers.providers.TransactionReceipt): number => {
  const eventInterface = new ethers.utils.Interface([
    "event nftDataRegistered(address contractAddress, uint256 tokenId)",
  ]);
  let tokenId = 0;
  receipt.logs.forEach((log) => {
    // check whether topic is nftDataRegistered(address contractAddress, uint256 tokenId)
    if (log.topics[0] === "0x957e0e652e4d598197f2c5b25940237e404f3899238efb6f64df2377e9aaf36c") {
      const description = eventInterface.parseLog({ topics: log.topics, data: log.data });
      tokenId = description.args[1].toNumber();
    }
  });
  return tokenId;
};
