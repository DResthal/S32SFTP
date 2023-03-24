import { S3 } from "@aws-sdk/client-s3";
import * as dotenv from "dotenv";
import SftpClient from "ssh2-sftp-client";
import fs from "fs";
import * as winston from "winston";
import { format } from "winston";

dotenv.config();
const REGION = "us-east-1";
const localDir = "files/";
const s3client = new S3({ region: REGION });
const PARAMS = {
  Bucket: "dom-tftp-00183",
};
const config = {
  host: process.env.SFTP_HOST,
  username: process.env.SFTP_USER,
  privateKey: process.env.SFTP_PRIV_KEY,
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
    new winston.transports.File({
      filename: "s32sftp.log",
      level: "info",
      timestamp: true,
      colorize: true,
    }),
  ],
});

async function getObject(PARAMS, filename) {
  logger.info({
    message: `Donwloading file: ${filename}`,
  });
  await s3client.getObject(PARAMS, (err, data) => {
    if (err === null) {
      data.Body.transformToString().then((res) => {
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir);
        }
        fs.writeFileSync(localDir + filename, res);
        logger.info({
          message: `File ${filename} Downloaded.`,
        });
      });
    } else {
      logger.error({
        level: "error",
        message: err.stack,
      });
    }
  });
}

function processFiles(dir) {
  fs.readdir(dir, (err, files) => {
    logger.info({
      message: `processFiles() Current Variables: dir: ${dir}, files: ${files}`,
    });
    if (err === null) {
      files.forEach((file) => {
        sendFile(dir, file);
      });
    } else {
      logger.error({
        level: "error",
        message: err.stack,
      });
    }
  });
}

function sendFile(dir, file) {
  logger.info({
    message: `Attempting to create SFTP connection using the current configuration: ${config}`,
  });
  try {
    const sftp = new SftpClient(config);
    logger.info({
      message: `Connection created.`,
    });
    sftp
      .connect(config)
      .then(() => {
        return sftp.cwd();
      })
      .then((cwd) => {
        logging.info({
          message: `Sanity Check: Sending file ${cwd + "/" + file} to server.`,
        });
        return sftp.put(dir + file, cwd + "/" + file);
      })
      .catch((err) => {
        logger.error({
          level: "error",
          message: err.stack,
        });
      })
      .finally(() => {
        sftp.end();
      });
  } catch (err) {
    logger.error({
      message: `Unable to create SFTP connection: ${err}`,
    });
  }
}

console.log("running");
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
        let newName = folder + year + month + day;
        logger.info({
          message: `New Filename: ${newName}`,
        });
        getObject(PARAMS, newName);
      }
    });
    logger.info({
      message: "Processing Files",
    });
    processFiles(localDir);
  } else {
    logger.error({
      level: "error",
      message: err.stack,
    });
  }
});
logger.info({
  message: "Transfer Complete.",
});
