const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const Joi = require('joi'); // npm install joi

admin.initializeApp();
const db = admin.firestore();

// Define the strict model for a DropOff
const dropOffSchema = Joi.object({
  name: Joi.string().optional(),
  phoneNumber: Joi.string().optional(),
  destination: Joi.object({
    lat: Joi.number().required(),
    lng: Joi.number().required()
  }).required(),
  destinationName: Joi.string().required(),
  gov: Joi.string().optional(),
  price: Joi.number().optional(),
  productName: Joi.string().optional(),
  expeditorId: Joi.string().required()
});

// Validate API key against Firestore users
async function validateApiKey(apiKey) {
  if (!apiKey) return false;
  try {
    const userDoc = await db.collection('users').doc(apiKey).get();
    if (!userDoc.exists) return false;
    const userData = userDoc.data();
    return userData.role === 'company';
  } catch (error) {
    console.error('Error validating API key:', error);
    return false;
  }
}



// Cloud function to create a drop-off
exports.createDropOff = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        return res.status(405).send({ error: 'Only POST requests allowed' });
      }

      const apiKey = req.headers['x-api-key'];
      const isValid = await validateApiKey(apiKey);
      if (!isValid) {
        return res.status(401).send({ error: 'Invalid API key or insufficient role' });
      }

      // Validate incoming stop data
      const { error, value } = dropOffSchema.validate(req.body);
      if (error) {
        return res.status(400).send({ error: error.details[0].message });
      }

      // Map validated data to Firestore schema
      const dropOff = {
        name: value.name || null,
        phoneNumber: value.phoneNumber || null,
        destination: { latitude: value.destination.lat, longitude: value.destination.lng },
        destinationName: value.destinationName,
        isdelivered: null,
        gov: value.gov || null,
        expeditorId: value.expeditorId,
        price: value.price || null,
        productName: value.productName || null,
        createdBy: apiKey,
        date: Date.now(),
      };

      const docRef = await db.collection('stops').add(dropOff);
      return res.status(201).send({ success: true, id: docRef.id });

    } catch (error) {
      console.error(error);
      return res.status(500).send({ error: 'Internal server error' });
    }
  });
});


// Cloud function to get stops by expeditorId
exports.getStopsByExpeditor = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        return res.status(405).send({ error: 'Only POST requests allowed' });
      }

      const apiKey = req.headers['x-api-key'];
      const isValid = await validateApiKey(apiKey);
      if (!isValid) {
        return res.status(401).send({ error: 'Invalid API key or insufficient role' });
      }

      const { expeditorId } = req.body;
      if (!expeditorId) {
        return res.status(400).send({ error: 'Missing expeditorId' });
      }

      // Query Firestore for all stops with this expeditorId
      const stopsSnapshot = await db.collection('stops')
        .where('expeditorId', '==', expeditorId)
        .get();

      const stops = stopsSnapshot.docs.map(doc => ({
        id: doc.id,
        isDelivered: doc.data().isdelivered || null,
        link: `https://xschnell.com/${doc.id}`
      }));

      return res.status(200).send({ stops });

    } catch (error) {
      console.error(error);
      return res.status(500).send({ error: 'Internal server error' });
    }
  });
});

