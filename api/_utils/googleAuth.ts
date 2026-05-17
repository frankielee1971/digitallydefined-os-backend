import { google } from 'googleapis';

export function getGoogleAuth(scopes: string[]) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
  }

  const serviceAccount = JSON.parse(serviceAccountJson);

  // NEW Google API JWT constructor (v140+)
  const jwt = new google.auth.JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes
  });

  return jwt;
}
