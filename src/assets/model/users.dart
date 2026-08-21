class shnellUsers {
  final String email;
  final String name;
  final String phone;
  final String role;
  final String accType; // 'pro' or 'standard'
  final String? fcmToken;
  final double balance;   // Made non-nullable for easier math
  //final List<String>? vehicleId;
  final bool isActive;
  final bool darkMode;
  final String platform;
  final bool isPhoneVerified;

  shnellUsers({
    required this.email,
    required this.name,
    required this.phone,
    required this.role,
    required this.accType,
    required this.platform,
    required this.fcmToken,
    required this.balance,
    //this.vehicleId,
    required this.isActive,
    required this.darkMode,
    required this.isPhoneVerified
  });

  factory shnellUsers.fromJson(Map<String, dynamic> json) {
    // Helper function to safely parse doubles from dynamic types
    double parseDouble(dynamic value) {
      if (value == null) return 0.0;
      if (value is num) return value.toDouble();
      if (value is String) return double.tryParse(value) ?? 0.0;
      return 0.0;
    }

    return shnellUsers(
      email: json['email']?.toString() ?? "",
      name: json['name']?.toString() ?? "Unknown Driver",
      phone: json['phone']?.toString() ?? "No Phone",
      role: json['role']?.toString() ?? "driver",
      accType: json['accType']?.toString() ?? "standard",
      fcmToken: json['fcmToken'].toString(),
      balance: parseDouble(json['balance']),
      //vehicleId: json['vehicleId'] is List ? List<String>.from(json['vehicleId']) : null,
      isActive: json['isActive'] is bool ? json['isActive'] : false,
      darkMode: json['darkMode'] is bool ? json['darkMode'] : true,
      platform: json['platform']?.toString() ?? "android",
      isPhoneVerified: json['isPhoneVerified'] is bool ? json['isPhoneVerified'] : false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'email': email,
      'name': name,
      'phone': phone,
      'role': role,
      'fcmToken': fcmToken,
      'balance': balance,
      //'vehicleId': vehicleId,
      'isActive': isActive,
      'accType': accType,
      'darkMode': darkMode,
      'language': 'fr', // Assuming French is the default
      'platform': platform,
      'isPhoneVerified' : isPhoneVerified

    };
  }
}