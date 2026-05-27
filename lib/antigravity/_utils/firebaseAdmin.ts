import * as admin from 'firebase-admin';

let app: admin.app.App | null = null;

function getFirebaseApp() {
  if (app) return app;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
  }

  const serviceAccount = JSON.parse(serviceAccountJson);

  app = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: serviceAccount.project_id,
  });

  return app;
}

export function getFirestore() {
  return getFirebaseApp().firestore();
}

export function getAuth() {
  return getFirebaseApp().auth();
}
