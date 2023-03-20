import { S3 } from "@aws-sdk/client-s3";

const REGION = "us-east-1";
const s3client = new S3({ region: REGION });
const PARAMS = {
  Bucket: "dom-tftp-00183",
};

async function getObject(PARAMS) {
  let file = s3client.getObject(PARAMS, (err, data) => {
    if (err) {
      console.log(err, err.stack);
    } else {
      data.Body.transformToString().then((result) => {
        console.log("String: " + result);
      });
      return data;
    }
  });

  return file;
}

s3client.listObjects(PARAMS, (err, data) => {
  if (err === null) {
    data.Contents.forEach(async (i) => {
      if (i.Size != 0) {
        PARAMS.Key = i.Key;
        console.log(`PARAMS = ${PARAMS.Key}`);
        let file = await getObject(PARAMS);
        let [outbound, folder, year, month, day, filename] = i.Key.split("/");
        folder += "-";
        let newName = folder + year + month + day;
        console.log(newName);
      }
    });
  } else {
    console.log(err, err.stack);
  }
});
