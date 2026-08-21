import { Component } from '@angular/core';

@Component({
  selector: 'app-service',
  templateUrl: './service.component.html',
  styleUrls: ['./service.component.css']
})
export class ServiceComponent {
  services = [
    {
      icon: 'fa-plane',
      title: 'Air Freight',
      description: 'Shnell connects you to fast and reliable air freight options for urgent parcels, ensuring next-day delivery across regions.'
    },
    {
      icon: 'fa-ship',
      title: 'Ocean Freight',
      description: 'Economical and secure ocean shipping for bulk logistics, ideal for larger shipments without compromising delivery reliability.'
    },
    {
      icon: 'fa-truck',
      title: 'Land Transport',
      description: 'Optimized land delivery solutions using our route planning algorithms to save time and fuel for local and regional transport.'
    },
    {
      icon: 'fa-store',
      title: 'Cargo Storage',
      description: 'Safe, flexible storage for your parcels, with real-time tracking and status updates while your cargo is in our facilities.'
    }
  ];

  // New feature section
  features = [
    {
      icon: 'fa-map-marker-alt',
      title: 'Live Tracking',
      description: 'Monitor your deliveries in real-time and get ETA updates for each stop, enhancing transparency and trust.'
    },
    {
      icon: 'fa-random',
      title: 'Optimized Routes',
      description: 'Save time and fuel with AI-powered route planning, even with multiple stops per driver.'
    },
    {
      icon: 'fa-cogs',
      title: 'Flexible Assignments',
      description: 'Easily assign deliveries manually or let Shnell suggest optimal assignment combinations.'
    },
    {
      icon: 'fa-dollar-sign',
      title: 'Affordable & Transparent',
      description: 'Pay-per-use pricing ensures small businesses only pay for what they use, keeping operations cost-effective.'
    }
  ];

  testimonials = [
    { img: 'img/testimonial-1.jpg', name: 'Ahmed Benali', profession: 'Courier Manager', text: 'Shnell has streamlined our daily deliveries. The live tracking and easy assignment system is a game changer for our small team.' },
    { img: 'img/testimonial-2.jpg', name: 'Claire Dupont', profession: 'E-commerce Seller', text: 'Using Shnell improved my delivery reliability dramatically. I can see exactly where my parcels are at any time.' },
    { img: 'img/testimonial-3.jpg', name: 'Youssef Kacem', profession: 'Logistics Coordinator', text: 'The dashboard is simple but powerful. Tracking multiple drivers in real time saves us hours each week.' },
    { img: 'img/testimonial-4.jpg', name: 'Marie Leblanc', profession: 'Store Owner', text: 'I can assign parcels manually or automate with Shnell’s TSP solver. It fits our business perfectly without wasting money.' }
  ];
}
