import admin from 'firebase-admin';

let firebaseAdmin: admin.app.App;

if (!admin.apps.length) {
  firebaseAdmin = admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}')
    )
  });
} else {
  firebaseAdmin = admin.app();
}

export { firebaseAdmin };

