import { Job } from "bullmq";

import ffmpeg from "fluent-ffmpeg";
import {
  createReadStream,
  promises as fsPromises,
  readFileSync,
  statSync,
} from "fs";

import { logger } from "./queue-worker";
import { finalAudioBucket, minioClient } from "../utils/minio";
import fetch from "node-fetch";
import FormData from "form-data";

const {
  MINIO_HOST = "",
  MINIO_ROOT_USER = "",
  MINIO_API_PORT = 9000,
} = process.env;

export default async (job: Job) => {
  const { audioId, fileExtension } = job.data;

  try {
    logger.info(`audioId: ${audioId} \t verifying audio`);

    let progress = 10;
    const tempFolder = `/data/media/verifying/${audioId}`;
    logger.info(
      `MinIO is at ${MINIO_HOST}:${MINIO_API_PORT} ${MINIO_ROOT_USER}`
    );
    try {
      await fsPromises.stat(tempFolder);
    } catch (e) {
      await fsPromises.mkdir(tempFolder, { recursive: true });
    }

    const minioTrackLocation = `${audioId}/original.${fileExtension}`;
    const localTrackPath = `${tempFolder}/original.${fileExtension}`;
    await minioClient.fGetObject(
      finalAudioBucket,
      minioTrackLocation,
      localTrackPath
    );

    logger.info(`audioId: ${audioId} \t got the track audio`);

    await job.updateProgress(progress);

    logger.info(`audioId: ${audioId} \t checking audio for existing tags`);

    const stats = statSync(localTrackPath);
    // const fileSizeInBytes = stats.size;

    // You can pass any of the 3 objects below as body
    // const stream = await createReadStream(localTrackPath);
    const file = await readFileSync(localTrackPath);
    const blob = new Blob([file], { type: `audio/${fileExtension}` });
    console.log("file", file);

    const formData = new FormData();
    // formData.append("file", blob);
    formData.append("api_token", process.env.AUDD_IO_TOKEN);

    const url = `${process.env.API_DOMAIN}/v1/tracks/${audioId}/audio`;
    const jsonBody = JSON.stringify({
      url,
      api_token: process.env.AUDD_IO_TOKEN,
    });

    console.log("url", url);
    const response = await fetch(`https://enterprise.audd.io/recognize`, {
      method: "POST",
      body: jsonBody,
      headers: {
        Accept: "application/json",
        "Content-Type": "multipart/form-data",
      },
    });
    console.log("status", response.status);
    console.log("response", await response.json());
    // ffmpeg(stream)
    //   .outputOptions("-chromaprint")
    //   .on("error", function (err, stdout, stderr) {
    //     console.log("Error: " + err.message);
    //     console.log("ffmpeg output:\n" + stdout);
    //     console.log("ffmpeg stderr:\n" + stderr);
    //   })
    //   .on("end", function () {})
    //   .save(destinationFolder);

    logger.info(`audioId: ${audioId} \t verifying chromaprint exists`);
  } catch (e) {
    logger.error("Error verifying audio", e);
    return { error: e };
  }
};