import * as functions from "firebase-functions";
import * as playwright from "playwright-aws-lambda";
import { union } from "lodash";

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
export const procurement = functions.pubsub.schedule(
  "every 3 hours synchronized",
).onRun(
  async () => {
    const query = await firestore().collection("procurement").get();
    const docNames = query.docs.map((doc) => {
      const path = doc.ref.path;
      const docName = path.split("/")[1];
      return docName;
    });

    const browser = await playwright.launchChromium({ headless: true });
    const fetchData = async (docName: string) => {
      const page = await browser.newPage();
      await page.goto("https://www.p-portal.go.jp/pps-web-biz/UAA01/OAA0101", {
        waitUntil: "networkidle",
      });
      await page.locator("#case-name").type(`${docName}`);
      await page.locator("#OAA0102").click();
      await page.locator("#tri_WAA0101FM01 > div.result-detail > table > tbody")
        .waitFor({
          state: "attached",
        });
      const titles = await page.locator(
        "div.result-detail > table > tbody > tr > td:nth-child(2)",
      )
        .evaluateAll(
          (tds) => tds.map((td) => td.textContent),
        );
      const ids = await page.locator(
        "div.result-detail > table > tbody > tr > td:nth-child(1)",
      )
        .evaluateAll(
          (tds) => tds.map((td) => td.textContent),
        );
      // await page.close();
      const data = await firestore().collection("procurement").doc(docName)
        .get().then((doc) => doc.data());
      await firestore().collection("procurement").doc(docName).set({
        ids: union(data?.ids, ids),
        titles: union(data?.titles, titles),
      });
    };
    await browser.close();
    docNames.map(async (docName) => await fetchData(docName));
  },
);

import * as admin from "firebase-admin";
admin.initializeApp();

import allowedEmails from "./allowedEmails";
import { firestore } from "firebase-admin";

exports.allowUserByEmail = functions.auth.user().onCreate((user) => {
  const uid = user.uid;
  const email = user.email;

  if (email === undefined || !allowedEmails.includes(email)) {
    admin
      .auth()
      .revokeRefreshTokens(uid)
      .then(() => {
        admin
          .auth()
          .deleteUser(uid)
          .then(() => {
            console.log(`Delete user: ${email}`);
          });
      });
  }
});
