import 'package:cloud_firestore/cloud_firestore.dart';

class Bid {
  String idOrder;
  String idDriver;
  String idUser;
  double ammount;
  bool isActive;
  DateTime? timestamp; // Added to allow sorting history by date

  Bid({
    required this.idDriver,
    required this.idOrder,
    required this.idUser,
    required this.ammount,
    required this.isActive,
    this.timestamp,
  });

  // --- THE MISSING PART ---
  factory Bid.fromFirestore(DocumentSnapshot doc) {
    final data = doc.data() as Map<String, dynamic>;
    
    return Bid(
      idDriver: data['idDriver'] ?? '',
      idOrder: data['idOrder'] ?? '',
      idUser: data['idUser'] ?? '',
      isActive: data['isActive'] ?? true,
      ammount: data['ammount'] != null ? (data['ammount'] as num).toDouble() : 0.0,
      // Safe conversion from Firestore Timestamp to Dart DateTime
      timestamp: (data['timestamp'] as Timestamp?)?.toDate(),
    );
  }


  Map<String, dynamic> toJson() {
    return {
      'idDriver': idDriver,
      'idOrder': idOrder,
      'idUser': idUser,
      'ammount': ammount,
      'isActive': isActive,
      // Automatically sets server time when you upload the bid
      'timestamp': FieldValue.serverTimestamp(),
    };
  }
}