import prisma from "@mirlo/prisma";

import logger from "../logger";
import { flatten } from "lodash";

const addPostToNotifications = async () => {
  const date = new Date();

  const nonDeletedArtistsWithSubscriptions = await prisma.artist.findMany({
    where: {
      deletedAt: null,
      subscriptionTiers: {
        some: {
          deletedAt: null,
          userSubscriptions: {
            some: {
              deletedAt: null,
              user: {
                deletedAt: null,
                emailConfirmationToken: null,
              },
            },
          },
        },
      },
    },
  });

  const posts = await prisma.post.findMany({
    where: {
      publishedAt: {
        lte: date,
      },
      hasAnnounceEmailBeenSent: false,
      deletedAt: null,
      artist: {
        id: {
          in: nonDeletedArtistsWithSubscriptions.map((a) => a.id),
        },
      },
    },
    include: {
      artist: {
        where: {
          deletedAt: null,
        },
        include: {
          subscriptionTiers: {
            where: {
              deletedAt: null,
            },
            include: {
              userSubscriptions: {
                where: {
                  deletedAt: null,
                },
                include: {
                  user: true,
                },
              },
            },
          },
        },
      },
    },
  });

  logger.info(`found ${posts.length} posts`);

  try {
    await Promise.all(
      posts.map(async (post) => {
        const subscriptions = flatten(
          post.artist?.subscriptionTiers.map((st) => st.userSubscriptions)
        );
        const postContent = post.content;

        await prisma.notification.createMany({
          data: subscriptions.map((s) => ({
            postId: post.id,
            content: postContent,
            userId: s.userId,
            notificationType: "NEW_ARTIST_POST",
          })),
          skipDuplicates: true,
        });

        logger.info(`created ${subscriptions.length} notifications`);

        await prisma.post.update({
          where: {
            id: post.id,
          },
          data: {
            hasAnnounceEmailBeenSent: true,
          },
        });
      })
    );
  } catch (e) {
    console.error(e);
    logger.error(`Failed to create all notifications`);
    logger.error(e);
  }
};

export default addPostToNotifications;
