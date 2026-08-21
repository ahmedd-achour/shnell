import 'package:cloud_firestore/cloud_firestore.dart';

class Cancelation {
 String idDeal;
 String cancelledBy;


  Cancelation({
   required this.cancelledBy,
   required this.idDeal,
   
   });

 
  Map<String, dynamic> toJson() {
    return {
      'cancelledBy': cancelledBy,
      'idDeal': idDeal,
      'time': Timestamp.now(),

    };
  }
}