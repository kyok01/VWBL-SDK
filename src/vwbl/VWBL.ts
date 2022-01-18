import Web3 from "web3";
import AWS from "aws-sdk";
import { VWBLNFT } from "./blockchain/VWBLProtocol";
import ManageKeyType from "./types/ManageKeyType";
import UploadImageType from "./types/UploadImageType";
import UploadMetadataType from "./types/UploadMetadataType";
import VWBLApi from "./api/VWBLApi";
import { createRandomKey, decrypt, encrypt } from "../util/cryptoHelper";
import { AWSConfig } from "../aws/types";
import { FileContent, FileType, UploadFile, UploadMetadata } from "../common/types/File";
import { uploadAll, uploadMetadata } from "../aws/upload";
import { signToGetKey, signToSetKey } from "./blockchain/Sign";
import axios from "axios";
import { ExtractMetadata } from "./metadata/type";

export type ConstructorProps = {
  web3: Web3;
  contractAddress: string;
  manageKeyType: ManageKeyType;
  uploadImageType: UploadImageType;
  uploadMetadataType: UploadMetadataType;
  awsConfig: AWSConfig;
  vwblNetworkUrl: string
}

export type VWBLOption = ConstructorProps;

export type CreateTokenProps = {
  plainData: string;
}

export class VWBL {
  private nft: VWBLNFT;
  public opts: VWBLOption;
  private api: VWBLApi;
  private getKeySign?: string;
  private setKeySign?: string;

  constructor(props: ConstructorProps) {
    const {web3, contractAddress, manageKeyType, uploadImageType, uploadMetadataType, awsConfig, vwblNetworkUrl} = props;
    this.nft = new VWBLNFT(web3, contractAddress);
    this.opts = props;
    this.api = new VWBLApi(vwblNetworkUrl);
    if (uploadImageType === UploadImageType.S3 || uploadMetadataType === UploadMetadataType.S3) {
      if (!awsConfig) {
        throw new Error("please specify S3 bucket.");
      }
      AWS.config.update({
        region: awsConfig.region,
        credentials: new AWS.CognitoIdentityCredentials({
          IdentityPoolId: awsConfig.idPoolId,
        }),
      });
    }
  }

  sign = async () => {
    this.getKeySign = await signToGetKey(this.opts.web3);
    console.log("get signed")
    const sleep = (ms: number): Promise<NodeJS.Timeout> => {
      return new Promise(resolve => {
        return setTimeout(resolve, ms)
      })
    };
    // Hack: metamaskが連続してsignを呼ぶとバグるので１秒のthread sleepを入れている
    await sleep(1000);
    this.setKeySign = await signToSetKey(this.opts.web3);
    console.log("set signed")
  };

  hasSign = () => this.getKeySign && this.setKeySign;

  createToken = async (name: string, description: string, plainData: FileContent, fileType: FileType, thumbnailImage: FileContent, uploadFileCallback?: UploadFile, uploadMetadataCallBack?: UploadMetadata) => {
    if (!this.setKeySign) {
      throw ("please sign first")
    }
    const {manageKeyType, uploadImageType, uploadMetadataType, awsConfig, vwblNetworkUrl} = this.opts;
    // 1. mint token
    const tokenId = await this.nft.mintToken(vwblNetworkUrl);
    // 2. create key in frontend
    const key = createRandomKey();
    // 3. encrypt data
    console.log("encrypt data")
    const encryptedContent = encrypt(plainData.content, key);
    // 4. upload data
    console.log("upload data")
    const uploadAllFunction = uploadImageType === UploadImageType.S3 ? uploadAll : uploadFileCallback;
    if (!uploadAllFunction) {
      throw new Error("please specify upload file type or give callback")
    }
    const {encryptedDataUrl, thumbnailImageUrl} = await uploadAllFunction(plainData, thumbnailImage, encryptedContent, awsConfig);
    // 5. upload metadata
    console.log("upload meta data")
    const uploadMetadataFunction = uploadMetadataType === UploadMetadataType.S3 ? uploadMetadata : uploadMetadataCallBack;
    if (!uploadMetadataFunction) {
      throw new Error("please specify upload metadata type or give callback")
    }
    await uploadMetadataFunction(tokenId, name, description, thumbnailImageUrl, encryptedDataUrl, fileType, awsConfig)
    // 6. set key to vwbl-network
    await this.api.setKey(tokenId, key, this.setKeySign);
  };

  getOwnTokens = async () : Promise<ExtractMetadata[]> => {
    if (!this.getKeySign) {
      throw ("please sign first")
    }
    const ownTokenIds = await this.nft.getOwnTokenIds();
    const ownTokens = (await Promise.all(ownTokenIds.map(this.extractMetadata.bind(this)))).filter((extractMetadata): extractMetadata is ExtractMetadata => extractMetadata !== undefined);
    return ownTokens;
  };

  extractMetadata = async (tokenId: number) : Promise<ExtractMetadata | undefined> => {
    if (!this.getKeySign) {
      throw ("please sign first")
    }
    const metadataUrl = await this.nft.getMetadataUrl(tokenId);
    const metadata = (await axios.get(metadataUrl).catch(() => undefined))?.data;
    // delete token if metadata is not found
    if (!metadata) {
      return undefined;
    }
    const encryptedDataUrl = metadata.encrypted_image_url ?? metadata.encrypted_data;
    // metadata.encrypted_image_url is deprecated
    const encryptedData = (await axios.get(encryptedDataUrl)).data;
    const decryptKey = await this.api.getKey(tokenId, this.getKeySign);
    const ownData = decrypt(encryptedData, decryptKey);
    // .encrypted is deprecated
    const fileName = encryptedDataUrl.split("/").slice(-1)[0].replace(/(.encrypted)|(.vwbl)/, "");
    return {
      id: tokenId,
      name: metadata.name,
      description: metadata.description,
      image: metadata.image,
      fileType: metadata.file_type,
      fileName,
      ownData,
    };
  }
}