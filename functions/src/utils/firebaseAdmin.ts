import * as admin from "firebase-admin";

let firebaseApp: admin.app.App | undefined;

const initializeFirebaseApp = (): admin.app.App => {
  if (firebaseApp) {
    return firebaseApp;
  }

  firebaseApp = admin.apps.length > 0 ?
    admin.app() :
    admin.initializeApp();

  return firebaseApp;
};

export const getFirebaseAdminApp = (): admin.app.App =>
  initializeFirebaseApp();

export const getFirestore = (): FirebaseFirestore.Firestore =>
  getFirebaseAdminApp().firestore();
