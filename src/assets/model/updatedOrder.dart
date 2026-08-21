import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:shnell/model/oredrs.dart';

class UpdatedOrder {
  String newPickupName; // Not nullable anymore
  List<String> newStops; // Not nullable anymore
  String newCategory; 

  // Pro Specs
  bool elevatorOnPickup;
  int pickupFloor;
  bool elevatorOnDropoff;
  int dropoffFloor;

  UpdatedOrder({
    required this.newPickupName,
    required this.newStops,
    required this.newCategory,
    required this.elevatorOnPickup,
    required this.pickupFloor,
    required this.elevatorOnDropoff,
    required this.dropoffFloor,
  });

  // Helper to check if data actually changed vs original
  bool hasChanges(Orders original) {
    return newPickupName != original.namePickUp ||
           newCategory != original.category ||
           newStops.join() != original.stops.join() ||
           elevatorOnPickup != original.elevatorOnPickup ||
           pickupFloor != original.pickupFloor;
  }

  Map<String, dynamic> toJson() => {
    'newPickupName': newPickupName,
    'newStops': newStops,
    'newCategory': newCategory,
    'elevatorOnPickup': elevatorOnPickup,
    'pickupFloor': pickupFloor,
    'elevatorOnDropoff': elevatorOnDropoff,
    'dropoffFloor': dropoffFloor,
    'updatedAt': FieldValue.serverTimestamp(),
  };
}