import { Injectable, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

export interface SendNotificationRequest {
  userId: string;
  header: string;
  body: string;
}

export interface SendNotificationResponse {
  success: boolean;
  messageId?: string;
  message?: string;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private functions = inject(Functions);

  /**
   * Triggers the backend Cloud Function 'sendUserNotification'
   * Request structure expected by backend: { userId, header, body }
   */
  async sendUserNotification(userId: string, header: string, body: string): Promise<SendNotificationResponse> {
    if (!userId || !header || !body) {
      throw new Error('User ID, Notification Title (header), and Body are all required.');
    }

    const callable = httpsCallable<SendNotificationRequest, SendNotificationResponse>(
      this.functions,
      'sendUserNotification'
    );

    try {
      const res = await callable({ userId, header, body });
      return res.data;
    } catch (err: any) {
      console.error('Error invoking sendUserNotification:', err);
      throw err;
    }
  }
}
