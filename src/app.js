import { S3 } from "@aws-sdk/client-s3";
import * as dotenv from "dotenv";
import SftpClient from "ssh2-sftp-client";
import * as winston from "winston";
import { format } from "winston";
import { Readable } from "node:stream";

dotenv.config();
const REGION = "us-east-1";
const s3client = new S3({ region: REGION });
const PARAMS = {
  Bucket: "dom-tftp-00183",
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
  await s3client.getObject(PARAMS, (err, data) => {
    if (err === null) {
      data.Body.transformToString().then((res) => {
        sendFile(res, filename);
      });
    } else {
      logger.error({
        level: "error",
        message: `Unable to download file: ${err}\n${err.stack}`,
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
        message: `Sanity Check: Sending file ${
          cwd + "/" + filename
        } to server.`,
      });
      return sftp.put(Readable.from(data), cwd + "/" + filename);
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

export function handler() {
  logger.info({
    level: "info",
    message: "Obtaining list of S3 objects",
  });
  s3client.listObjects(PARAMS, async (err, data) => {
    if (err === null) {
      logger.info({
        level: "info",
        message: "Filtering listed objects to only those with data.",
      });
      await data.Contents.forEach((i) => {
        if (i.Size != 0) {
          logger.info({
            message: `Found object: ${i.Key}`,
          });
          PARAMS.Key = i.Key;
          logger.info({
            message: `Cleaning Filename`,
          });
          let [outbound, folder, year, month, day, filename] = i.Key.split("/");
          folder += "-";
          let date = new Date();
          let curDay = date.getDate();
          let curMonth = date.getMonth() + 1;
          let curYear = date.getFullYear();
          let newName = folder + curYear + curMonth + curDay;
          logger.info({
            message: `New Filename: ${newName}`,
          });
          getObject(PARAMS, newName);
        }
      });
      logger.info({
        message: `Transfer complete.`,
      });
    } else {
      logger.error({
        level: "error",
        message: `${err} \n ${err.stack}`,
      });
    }
  });
}

export default handler;
