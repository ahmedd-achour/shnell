import { Component, inject } from '@angular/core';
import { Functions, httpsCallable } from '@angular/fire/functions';

@Component({
  selector: 'app-contact',
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.css']
})
export class ContactComponent {
  private functions = inject(Functions);

  name = '';
  email = '';
  subject = '';
  message = '';

  isSending = false;
  successMessage = '';
  errorMessage = '';

  async sendMessage() {
    if (!this.name || !this.email || !this.subject || !this.message) {
      this.errorMessage = 'Please fill out all fields.';
      return;
    }

    this.isSending = true;
    this.errorMessage = '';
    this.successMessage = '';

    // Sent by the sendContactMessage function: the email key stays on the server.
    try {
      const send = httpsCallable<
        { name: string; email: string; subject: string; message: string },
        { messageId: string }
      >(this.functions, 'sendContactMessage');
      await send({ name: this.name, email: this.email, subject: this.subject, message: this.message });
      this.successMessage = 'Your message has been sent successfully!';
      this.name = '';
      this.email = '';
      this.subject = '';
      this.message = '';
    } catch (err: any) {
      console.error('Email sending error:', err);
      this.errorMessage = `An error occurred: ${err?.message || 'Network error'}`;
    } finally {
      this.isSending = false;
    }
  }
}
