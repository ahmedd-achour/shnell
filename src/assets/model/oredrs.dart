import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:latlong2/latlong.dart' as lt;

class Orders {
  double price;
  double distance;
  String namePickUp;
  lt.LatLng pickUpLocation;
  List<String> stops; // List of stop IDs
  String vehicleType;
  String userId;
  bool isAcepted;
  String id;
  Timestamp? scheduleAt;
  String category;
       bool elevatorOnPickup;
   bool longWalkOnPickup;
   bool elevatorOnDropoff;
   bool longWalkOnDropoff;
   int pickupFloor;
   int dropoffFloor;
   String moveServiceSize; 
   bool bulkyItems;
   List<String>? optionalAssets = []; // List of optional assets
   double? budget; // Optional budget field
   String?  notes; // Optional notes field

  Orders({
    required this.price,
    required this.distance,
    required this.namePickUp,
    required this.pickUpLocation,
    required this.stops,
    required this.id,
    required this.vehicleType,
    required this.userId,
    this.isAcepted = false,
    this.scheduleAt,
    required this.category,
    this.elevatorOnPickup = false,
    this.bulkyItems = false,
    this.longWalkOnPickup = false,
    this.elevatorOnDropoff = false,
    this.longWalkOnDropoff = false,
    this.pickupFloor = 0,
    this.dropoffFloor = 0,
    required this.moveServiceSize,
    this.optionalAssets = const [],
    this.budget,
    this.notes


  });

  Map<String, dynamic> toJson() {
    return {
      'userID': FirebaseAuth.instance.currentUser!.uid,
      'price': price,
      'distance': distance,
      'namePickUp': namePickUp,
      'id' : id,
      'pickUpLocation': pickUpLocation.toJson(),
      'stops': stops, // Stored as a Firestore array
      'timestamp': Timestamp.now(),
      'vehicleType': vehicleType,
      'isAcepted': isAcepted,
      'scheduleAt': scheduleAt,
      "category" : category,
      "bulkyItems" : bulkyItems,
      "elevatorOnPickup": elevatorOnPickup,
      "longWalkOnPickup": longWalkOnPickup,
      "elevatorOnDropoff": elevatorOnDropoff,
      "longWalkOnDropoff": longWalkOnDropoff,
      "pickupFloor": pickupFloor,
      "dropoffFloor": dropoffFloor,
      "moveServiceSize": moveServiceSize,
      "optionalAssets": optionalAssets,
      "budget": budget,
      "notes": notes,
    };
  }

  factory Orders.fromFirestore(DocumentSnapshot doc) {
    Map<String, dynamic> data = doc.data() as Map<String, dynamic>;

    // Parse pickup location
    Map<String, dynamic> pickUpData = data['pickUpLocation'];
    lt.LatLng pickUpLoc = lt.LatLng(
      pickUpData['coordinates'][1],
      pickUpData['coordinates'][0],
    );

    return Orders(
      userId: data['userID'],
      price: (data['price'] as num).toDouble(),
      distance: (data['distance'] as num).toDouble(),
      namePickUp: data['namePickUp'],
      pickUpLocation: pickUpLoc,
      id: data['id'],
      stops: List<String>.from(data['stops'] ?? []),
      vehicleType: data['vehicleType'],
      isAcepted: data['isAcepted'] ?? false,
      scheduleAt: data['scheduleAt'],
      category: data['category'],
      bulkyItems: data['bulkyItems'] ?? false,
      elevatorOnPickup: data['elevatorOnPickup'] ?? false,
      longWalkOnPickup: data['longWalkOnPickup'] ?? false,
      elevatorOnDropoff: data['elevatorOnDropoff'] ?? false,
      longWalkOnDropoff: data['longWalkOnDropoff'] ?? false,
      pickupFloor: data['pickupFloor'] ?? 0,
      dropoffFloor: data['dropoffFloor'] ?? 0,
      moveServiceSize: data['moveServiceSize'] ?? "",
      optionalAssets: List<String>.from(data['optionalAssets'] ?? []),
      budget: (data['budget'] as num?)?.toDouble(),
      notes: data['notes'],
    );
  }
}