/**
 * Firebase project config only. Secrets (Mapbox, Gemini, Google Maps, Brevo)
 * live in Firebase Remote Config instead — see
 * `src/app/shared/remote-config.service.ts`. They can be rotated from the
 * Firebase console without a rebuild/redeploy, and never touch source control.
 */
export const environment = {
  production: false,
  firebaseConfig: {
    apiKey: "AIzaSyDWNJDwoOzrOywA98IN288Pc3K81SRwv9k",
    authDomain: "shnell-393a6.firebaseapp.com",
    databaseURL: "https://shnell-393a6-default-rtdb.firebaseio.com",
    projectId: "shnell-393a6",
    storageBucket: "shnell-393a6.appspot.com",
    messagingSenderId: "217120837439",
    appId: "1:217120837439:web:bf8efa57bd6d30294e0d8a",
    measurementId: "G-7H2GZ2YM6V"
  },
};
