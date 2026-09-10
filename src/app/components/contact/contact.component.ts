import { Component } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-contact',
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.css']
})
export class ContactComponent {
  name = '';
  email = '';
  subject = '';
  message = '';
  
  isSending = false;
  successMessage = '';
  errorMessage = '';

  constructor(private http: HttpClient) {}

  async sendMessage() {
    if (!this.name || !this.email || !this.subject || !this.message) {
      this.errorMessage = 'Please fill out all fields.';
      return;
    }

    this.isSending = true;
    this.errorMessage = '';
    this.successMessage = '';

    const apiKey = 'REDACTED';
    const senderEmail = 'service@xschnell.com';
    const recipientEmail = 'achour.space@gmail.com';

    const payload = {
      sender: { name: 'Shnell Contact', email: senderEmail },
      to: [{ email: recipientEmail, name: 'Achour' }],
      subject: `New Contact Form Submission: ${this.subject}`,
      htmlContent: `
        <div style="font-family: Arial, sans-serif; padding: 20px;">
          <h2>New Contact Message from ${this.name}</h2>
          <p><strong>Email:</strong> ${this.email}</p>
          <p><strong>Subject:</strong> ${this.subject}</p>
          <p><strong>Message:</strong></p>
          <blockquote style="background: #f9f9f9; padding: 15px; border-left: 5px solid #ccc;">
            ${this.message.replace(/\n/g, '<br>')}
          </blockquote>
        </div>
      `
    };

    const headers = new HttpHeaders({
      'accept': 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json'
    });

    try {
      const res = await firstValueFrom(
        this.http.post<any>('https://api.brevo.com/v3/smtp/email', payload, { headers })
      );
      
      if (res && (res.messageId || res.id)) {
        this.successMessage = 'Your message has been sent successfully!';
        this.name = '';
        this.email = '';
        this.subject = '';
        this.message = '';
      } else {
        this.errorMessage = 'Failed to send message. Please try again.';
      }
    } catch (err: any) {
      console.error('Email sending error:', err);
      const msg = err?.error?.message || err?.message || 'Network / Auth error';
      this.errorMessage = `An error occurred: ${msg}`;
    } finally {
      this.isSending = false;
    }
  }
}
