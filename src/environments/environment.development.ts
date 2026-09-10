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
  googleMapsApiKey: 'REDACTED' ,// legacy — no longer used by the app maps
  mapboxAccessToken: 'REDACTED',
  // Gemini — smart column-mapping for the Parcels Excel import (Parcels tab).
  // NOTE: this ships in the browser bundle; restrict the key to the
  // Generative Language API + your domains, or proxy it via a Cloud Function.
  geminiApiKey: 'REDACTED',
  geminiModel: 'gemini-2.0-flash',
};
