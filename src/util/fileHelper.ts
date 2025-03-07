// eslint-disable-next-line @typescript-eslint/no-var-requires
const FileReaderNodeJs = require("filereader");

const isRunningOnBrowser = typeof window !== "undefined";

export const toBase64FromBlob = async (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = switchReader();
    reader.readAsDataURL(blob);
    reader.onload = () => {
      const result = reader.result;
      if (!result || typeof result !== "string") {
        reject("cannot convert to base64 string");
      } else {
        resolve(result);
      }
    };
    reader.onerror = (error: any) => reject(error);
  });
};

export const getMimeType = (file: File): string => {
  return file.type;
};

export const toArrayBuffer = async (blob: Blob): Promise<ArrayBuffer> => {
  return new Promise((resolve, reject) => {
    const reader = switchReader();
    reader.readAsArrayBuffer(blob);
    reader.onload = () => {
      const result = reader.result;
      if (!result || !(result instanceof Uint8Array)) {
        reject("cannot convert to ArrayBuffer");
      } else {
        resolve(result);
      }
    };
    reader.onerror = (error: any) => reject(error);
  });
};

const switchReader = (): any => {
  if (isRunningOnBrowser) {
    return new FileReader();
  } else {
    return new FileReaderNodeJs();
  }
};
