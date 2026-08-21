import { Component, ElementRef, ViewChild } from '@angular/core';
import { Firestore, collection, query, where, getDocs } from '@angular/fire/firestore';
import { Router } from '@angular/router';
import { inject } from '@angular/core';
import { DropOffDataModel } from '../../../Models/dropoffdata.model';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.css']
})
export class HomeComponent {

  colisCount: number = 50; // default
  pricePerStop: number = 0.2;

  get dailyCost(): number {
    return this.colisCount * this.pricePerStop;
  }

  get monthlyCost(): number {
    return this.dailyCost * 26; // average working days per month
  }
  @ViewChild('videoPlayer') videoPlayer!: ElementRef<HTMLVideoElement>;

  ngAfterViewInit() {
    // Explicitly start the video after the view is initialized
    if (this.videoPlayer) {
      this.videoPlayer.nativeElement.muted = true; // Ensure it's muted
      this.videoPlayer.nativeElement.play().catch(error => {
        console.log("Autoplay was prevented:", error);
      });
    }
  }


faqs = [

{
question: "Comment fonctionne Shnell ?",
answer: "Shnell vous permet de réserver rapidement un transporteur pour déplacer des objets, des meubles ou organiser un déménagement. Vous indiquez le point de départ, la destination et le type de transport, et l'application vous connecte immédiatement avec un transporteur disponible.",
open:false
},

{
question: "Comment le prix est-il calculé ?",
answer: "Le prix est calculé automatiquement en fonction de la distance, du type de véhicule, du service demandé et du tarif de base. Le prix est affiché de manière transparente avant la confirmation de la demande.",
open:false
},

{
question: "Quels types de transporteurs sont disponibles ?",
answer: "La plateforme propose différents types de véhicules adaptés à vos besoins : utilitaires légers, camions de déménagement ou transporteurs spécialisés pour les objets volumineux.",
open:false
},

{
question: "Puis-je utiliser Shnell pour transporter un seul objet ?",
answer: "Oui. Shnell est conçu pour transporter aussi bien un simple meuble ou électroménager que pour gérer un déménagement complet.",
open:false
},

{
question: "Le service est-il rapide ?",
answer: "Oui. Shnell est une plateforme à la demande. Dans la plupart des cas, un transporteur peut accepter votre demande en quelques minutes selon la disponibilité dans votre zone.",
open:false
},
{
question: "Les transporteurs sont-ils vérifiés ?",
answer: "Oui. Les transporteurs présents sur Shnell sont vérifiés avant d'accéder à la plateforme. Nous contrôlons leurs informations et leurs véhicules afin de garantir un service fiable et professionnel.",
open:false
},

{
question: "Comment puis-je payer ma course ?",
answer: "Le paiement peut être effectué directement via l'application / cash selon les options disponibles. Le prix est confirmé avant la commande afin d'éviter toute surprise.",
open:false
},

{
question: "Puis-je suivre le transporteur ?",
answer: "Oui. Une fois la demande acceptée, vous pouvez suivre l'avancement de votre transport et rester en contact avec le transporteur pour organiser facilement la livraison.",
open:false
},

{
question: "Que se passe-t-il si aucun transporteur n'accepte la demande ?",
answer: "Si aucun transporteur n'est disponible immédiatement, votre demande reste visible sur la plateforme afin qu'un transporteur disponible puisse l'accepter dès que possible.",
open:false
},

{
question: "Dans quelles villes Shnell est-il disponible ?",
answer: "Shnell se développe progressivement dans plusieurs villes. La disponibilité dépend de la présence de transporteurs actifs dans votre zone.",
open:false
}
];

toggleFaq(index:number){
  this.faqs[index].open = !this.faqs[index].open;
}

private firestore: Firestore = inject(Firestore);
  phoneNumber: string = '';
  activeStops: { id: string, data: DropOffDataModel }[] = [];
  loading: boolean = false;

  constructor(private router: Router) {}
private normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  // Remove leading/trailing spaces
  phone = phone.trim();
  // Remove +216 or 00216 prefixes
  phone = phone.replace(/^(\+216|00216)/, '');
  // Remove any non-digit characters (optional)
  phone = phone.replace(/\D/g, '');
  return phone;
}

    async trackStops() {
      if (!this.phoneNumber) {
        alert('Please enter a phone number.');
        return;
      }
        this.phoneNumber = this.normalizePhoneNumber(this.phoneNumber);


      this.loading = true;
      this.activeStops = [];

      try {
        const stopsRef = collection(this.firestore, 'stops');
        const q = query(
          stopsRef,
          where('phoneNumber', '==', this.phoneNumber),
          //where('isdelivered', '==', null)
        );

        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          alert('No active stops found for this phone number.');
        } else if (querySnapshot.size === 1) {
          // Single stop → navigate to its tracking page
          const stopId = querySnapshot.docs[0].id;
          this.router.navigate([`/${stopId}`]);
        } else {
          // Multiple active stops → list them in table
          querySnapshot.forEach(docSnap => {
            this.activeStops.push({ id: docSnap.id, data: DropOffDataModel.fromFirestore(docSnap.data()) });
          });
        }
      } catch (err) {
        console.error(err);
        alert('Error fetching stops: ' + err);
      } finally {
        this.loading = false;
      }
    }

  trackStopById(stopId: string) {
    this.router.navigate([`/${stopId}`]);
  }
}
