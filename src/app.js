import { S3 } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import * as dotenv from "dotenv";
import SftpClient from "ssh2-sftp-client";
import * as winston from "winston";
import { format } from "winston";
import { Readable, Writable } from "node:stream";
import stream from "node:stream";

dotenv.config();
const date = new Date();
let today = date.getDate();
let thisMonth = date.getMonth() + 1;
let thisYear = date.getFullYear();
const REGION = "us-east-1";
const s3 = new S3({ region: REGION, logger: console });
const PARAMS = {
  Bucket: "dom-tftp-00183",
  Prefix: "outbound/",
};
const config = {
  host: process.env.SFTP_HOST,
  username: process.env.SFTP_USER,
  privateKey: process.env.SFTP_KEY,
};

const loggerFormat = format.combine(format.timestamp(), format.json());

const logger = winston.createLogger({
  level: "info",
  format: loggerFormat,
  transports: [
    new winston.transports.Console({
      timestamp: true,
      colorize: true,
    }),
    // new winston.transports.File({ filename: "s32sftp.log", level: "info", timestamp: true, colorize: true,}),
  ],
});

async function getObject(PARAMS, filename) {
  logger.info({
    message: `Attempting to read file: ${PARAMS.Key}`,
  });
  await s3.getObject(PARAMS, (err, data) => {
    if (err === null) {
      data.Body.transformToString().then((res) => {
        sendFile(res, filename);
      });
    } else {
      logger.error({
        level: "error",
        message: `Unable to read file: ${err}\n${err.stack}`,
      });
    }
  });
}

function sendFile(data, filename) {
  const sftp = new SftpClient(config);
  sftp
    .connect(config, () => {
      logger.info({
        message: `Connection created.`,
      });
    })
    .then(() => {
      return sftp.cwd();
    })
    .then((cwd) => {
      logger.info({
        message: `Streaming file to SFTP Server:  ${
          cwd + "/ToAssurantEFT/" + filename
        }`,
      });
      return sftp.put(Readable.from(data), cwd + "/ToAssurantEFT/" + filename);
    })
    .catch((err) => {
      logger.error({
        level: "error",
        message: `Unable to send file. ${err}\n${err.stack}`,
      });
    })
    .finally(() => {
      sftp.end();
    });
}

function getToday(key) {
  if (`${today}`.length < 2) {
    today = `0${today}`;
  }
  if (`${thisMonth}`.length < 2) {
    thisMonth = `0${thisMonth}`;
  }
  console.log(`Date Check: ${thisYear}${thisMonth}${today}`);
  if (key.includes(`${thisYear}${thisMonth}${today}`)) {
    return true;
  } else {
    return false;
  }
}

function cleanKey(key) {
  const [outbound, folder, year, month, day, file] = key.split("/");
  return `${folder}-${year}${month}${day}`;
}

function fromS3() {
  logger.info({
    level: "info",
    message: "Obtaining list of S3 objects",
  });

  let currentKeys = [];

  s3.listObjects(PARAMS, async (err, data) => {
    data.Contents.forEach((i) => {
      if (i.Size > 0) {
        if (getToday(i.Key) === true) {
          currentKeys.push(i.Key);
        }
      }
    });
    logger.info({
      message: `Current keys found: ${currentKeys}`,
    });
    currentKeys.forEach((key) => {
      PARAMS.Key = key;
      getObject(PARAMS, cleanKey(key));
    });
  });
}

async function storeS3(stream, key) {
  console.log(typeof key[0]);
  console.log(typeof stream);
  PARAMS.Key = key[0];
  PARAMS.Body = stream;
  PARAMS.Prefix = "inbound/";
  const upload = new Upload({
    client: s3,
    params: PARAMS,
  });
  upload.on("httpUploadProgress", (progress) => {
    console.log(progress);
  });
  await upload.done();
  return true;
}

function toS3() {
  const sftp = new SftpClient(config);

  sftp
    .connect(config)
    .then(() => {
      return sftp.cwd();
    })
    .then(async (cwd) => {
      return [await sftp.list(`${cwd}/FromAssurantEFT/`), cwd];
    })
    .then((data) => {
      let todaysFile = data[0].map((obj) => obj.name).filter(getToday);
      let filepath = `${data[1]}/FromAssurantEFT/${todaysFile}`;
      logger.info({
        message: `Today's File: ${todaysFile}`,
      });
      logger.info({
        message: `Full Filepath during get operation: ${filepath}`,
      });
      try {
        return [sftp.createReadStream(filepath), todaysFile];
      } catch (err) {
        console.log("Error creating read stream");
      }
    })
    .then(async (args) => {
      try {
        await storeS3(args[0], args[1]);
      } catch (err) {
        logger.error({
          message: `Unable to run 'storeS3' function. ${err} ${err.stack}`,
        });
      }
      return true;
    })
    .catch((err) => {
      logger.error({
        level: "error",
        message: `Unable to get file. ${err}\n${err.stack}`,
      });
    })
    .finally(() => {
      sftp.end();
    });
}

export function handler() {
  // fromS3();
  toS3();
}

export default handler;
