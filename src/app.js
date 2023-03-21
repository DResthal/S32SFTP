import { S3 } from "@aws-sdk/client-s3";
import * as dotenv from "dotenv";
import SftpClient from "ssh2-sftp-client";
import fs from "fs";

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
  privateKey: fs.readFileSync(process.env.SFTP_KEY),
};

async function getObject(PARAMS, filename) {
  await s3client.getObject(PARAMS, (err, data) => {
    if (err === null) {
      data.Body.transformToString().then((res) => {
        if (!fs.existsSync(localDir)) {
          fs.mkdirSync(localDir);
        }
        fs.writeFileSync(localDir + filename, res);
      });
    } else {
      console.log(err, err.stack);
    }
  });
}

function processFiles(dir) {
  fs.readdir(dir, (err, files) => {
    console.log(dir);
    console.log(files);
    if (err === null) {
      files.forEach((file) => {
        sendFile(dir, file);
      });
    } else {
      console.log(err, err.stack);
    }
  });
}

function sendFile(dir, file) {
  const sftp = new SftpClient(config);
  sftp
    .connect(config)
    .then(() => {
      return sftp.cwd();
    })
    .then((cwd) => {
      console.log(
        "Sanity Check: Sending file " + cwd + "/" + file + " to server."
      );
      return sftp.put(dir + file, cwd + "/" + file);
    })
    .catch((err) => {
      console.log(err, err.stack);
    })
    .finally(() => {
      sftp.end();
    });
}

s3client.listObjects(PARAMS, async (err, data) => {
  if (err === null) {
    await data.Contents.forEach((i) => {
      if (i.Size != 0) {
        PARAMS.Key = i.Key;
        let [outbound, folder, year, month, day, filename] = i.Key.split("/");
        folder += "-";
        let newName = folder + year + month + day;
        getObject(PARAMS, newName);
      }
    });
    processFiles(localDir);
  } else {
    console.log(err, err.stack);
  }
});
