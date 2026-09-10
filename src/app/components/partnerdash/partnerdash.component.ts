import { Component, OnInit, AfterViewInit, AfterViewChecked, NgZone, ViewChild, ElementRef } from '@angular/core';
import Chart from 'chart.js/auto';
import { LatLng } from '../../shared/latlng';
import { mapboxGeocodeOne } from '../../shared/mapbox';
import { DropOffDataModel } from '../../../Models/dropoffdata.model';
import { getFirestore, collection, addDoc, doc, setDoc, docData, Timestamp, serverTimestamp, runTransaction, query, where, getDocs, deleteDoc } from '@angular/fire/firestore';
import { getAuth } from '@angular/fire/auth';
import { firstValueFrom } from 'rxjs';
import { ShnellUser } from '../../../Models/shnellUsers.models';
import { StopsCacheService } from '../../../stopCashService';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx'; // For Excel parsing (npm install xlsx)

@Component({
  selector: 'app-partnerdash',
  templateUrl: './partnerdash.component.html',
  styleUrls: ['./partnerdash.component.css']
})
export class PartnerdashComponent implements OnInit, AfterViewInit, AfterViewChecked {
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  @ViewChild('govChartEl') govChartRef?: ElementRef<HTMLCanvasElement>;
  @ViewChild('prodChartEl') prodChartRef?: ElementRef<HTMLCanvasElement>;
  private govChart?: Chart;
  private prodChart?: Chart;
  private chartSig = '';

  // Step management
  currentStep: number = 1;

  pickupAddress: string = '';
  pickupLatLng: LatLng | null = null;
  dropOffs: DropOffDataModel[] = [];
  orderedDropOffs: DropOffDataModel[] = [];
  maxStops: number = 250;
  excelFile: File | null = null;
  isProcessingExcel = false;
  processedRows = 0;
  totalRows = 0;
  errorMessage: string | null = null;
  newDropOffName: string = '';
  newDropOffPhone: string = '';
  newDropOffPhone2: string = '';
  newDropOffDestination: string = '';
  newDropOffGov: string = '';
  newDropOffDescription: string = '';
  newDropOffParcelPrice: number | null = null;
  newDropOffExpeditor: string = '';
  editIndex: number | null = null;

  // Enhanced available stops filtering and sorting
  availableStops: DropOffDataModel[] = [];
  selectedStopIds: Set<string> = new Set();
  filterGov: string = '';
  filterProduct: string = '';
  filterPriceMin: number = 0;
  filterPriceMax: number | null = null;
  sortColumn: string = 'expeditorId';
  sortDirection: 'asc' | 'desc' = 'asc';
  uniqueProducts: (string | undefined)[] = [];
  selectAllFiltered: boolean = false;
  selectAllGlobal: boolean = false;

  governorates: string[] = [
    'Ariana', 'Béja', 'Ben Arous', 'Bizerte', 'Gabès', 'Gafsa', 'Jendouba', 'Kairouan', 'Kasserine',
    'Kébili', 'Le Kef', 'Mahdia', 'La Manouba', 'Médenine', 'Monastir', 'Nabeul', 'Sfax',
    'Sidi Bouzid', 'Siliana', 'Sousse', 'Tataouine', 'Tozeur', 'Tunis', 'Zaghouan'
  ];

  // Driver enhancements
  myDriverIds: string[] = [];
  driversof: ShnellUser[] = [];
  filteredDrivers: ShnellUser[] = [];
  driverSearch: string = '';
  selectedDriverId: string | null = null;
  selectedDriverIndex: number | null = null;
  firestore = getFirestore();

  // Fix for duplicate fallbacks: Cache pending geocoding promises by address to prevent concurrent calls
  private geocodingCache = new Map<string, Promise<{ lat: number; lng: number; formatted_address: string } | null>>();

  ngZone = new NgZone({ enableLongStackTrace: false });

  constructor(public cache: StopsCacheService) {}

  ngOnInit() {
    this.loadMyDriverIds();
    this.loadPendingStops();
    this.filterDrivers(); // Initial filter
    // Restore cached data - RECONSTRUCT INSTANCES
    if (this.cache.pickupAddress) {
      this.pickupAddress = this.cache.pickupAddress;
      this.currentStep = 2; // Jump to step 2 if pickup cached
    }
    if (this.cache.pickupLatLng) this.pickupLatLng = this.cache.pickupLatLng;
    if (this.cache.dropOffs) {
      this.dropOffs = this.cache.dropOffs.map((plainDrop: any) => this.ensureDropOffInstance(plainDrop));
      if (this.dropOffs.length > 0) this.currentStep = 3; // Jump to step 3 if drops cached
    }
    this.selectedDriverId = this.cache.selectedDriverId;
    this.selectedDriverIndex = this.cache.selectedDriverIndex;
    if (this.selectedDriverId) this.currentStep = 4; // Jump to step 4 if driver cached
    this.updateTSP();
    this.updateUniqueProducts();
    this.updateFilters();

    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (currentUser) {
      const companyDocRef = doc(this.firestore, 'users', currentUser.uid);
      docData(companyDocRef).subscribe((data: any) => {
        this.companyPayrate = Number(data?.payrate) ?? 0.25;
      });
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.refreshCharts(), 0);
  }

  ngAfterViewChecked(): void {
    if (this.currentStep !== 2) return;
    const rows = this.getFilteredAndSortedAvailable();
    const sig = rows.length + '|' + rows.map(r => (r.gov || '') + ':' + (r.productName || '')).join(',');
    if (sig !== this.chartSig) {
      this.chartSig = sig;
      setTimeout(() => this.refreshCharts(), 0);
    }
  }

  /** KPI + grouping helpers for the insights strip (based on the current filter). */
  get availableValue(): number {
    return Number(this.getFilteredAvailable().reduce((n, s) => n + (s.price || 0), 0).toFixed(2));
  }
  get selectedValue(): number {
    return Number(this.availableStops
      .filter(s => this.selectedStopIds.has((s as any).id))
      .reduce((n, s) => n + (s.price || 0), 0).toFixed(2));
  }
  private groupCount(rows: DropOffDataModel[], key: 'gov' | 'productName'): { label: string; n: number }[] {
    const m = new Map<string, number>();
    rows.forEach(r => { const k = (r[key] || '—').toString(); m.set(k, (m.get(k) || 0) + 1); });
    return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n).slice(0, 8);
  }

  private refreshCharts(): void {
    if (this.currentStep !== 2) return;
    const rows = this.getFilteredAvailable();
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--sh-ink-500')?.trim() || '#6B6459';

    if (this.govChartRef?.nativeElement) {
      const g = this.groupCount(rows, 'gov');
      const data = {
        labels: g.map(x => x.label),
        datasets: [{ label: 'Arrêts', data: g.map(x => x.n), backgroundColor: '#FFB300', borderRadius: 4, maxBarThickness: 22 }],
      };
      if (this.govChart) { this.govChart.data = data as any; this.govChart.update(); }
      else this.govChart = new Chart(this.govChartRef.nativeElement, {
        type: 'bar', data: data as any,
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: {
            x: { beginAtZero: true, ticks: { color: ink, precision: 0 }, grid: { color: 'rgba(0,0,0,0.06)' } },
            y: { ticks: { color: ink, font: { size: 10 } }, grid: { display: false } },
          },
        },
      });
    }

    if (this.prodChartRef?.nativeElement) {
      const g = this.groupCount(rows, 'productName');
      const palette = ['#FFC107', '#12805C', '#2563EB', '#D42F2F', '#7A5300', '#0E7A5F', '#B7791F', '#938B7D'];
      const data = {
        labels: g.map(x => x.label),
        datasets: [{ data: g.map(x => x.n), backgroundColor: palette.slice(0, g.length), borderWidth: 0 }],
      };
      if (this.prodChart) { this.prodChart.data = data as any; this.prodChart.update(); }
      else this.prodChart = new Chart(this.prodChartRef.nativeElement, {
        type: 'doughnut', data: data as any,
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '60%',
          plugins: { legend: { position: 'right', labels: { color: ink, boxWidth: 10, font: { size: 10 } } } },
        },
      });
    }
  }

  goToStep(step: number) {
    if (step < this.currentStep) {
      this.currentStep = step;
    } else if (step === 2 && this.pickupLatLng) {
      this.currentStep = step;
    } else if (step === 3 && this.dropOffs.length > 0) {
      this.currentStep = step;
    } else if (step === 4 && this.selectedDriverId) {
      this.currentStep = step;
    }
  }

  // FIXED: Utility to ensure/restore DropOffDataModel instance using fromFirestore (perfect match for serialized data)
  private ensureDropOffInstance(plainDrop: any): DropOffDataModel {
    const model = DropOffDataModel.fromFirestore(plainDrop);
    // Preserve ID if present (for existing stops)
    if (plainDrop.id) {
      (model as any).id = plainDrop.id;
    }
    return model;
  }

  async loadPendingStops() {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    try {
      const q = query(
        collection(this.firestore, 'stops'),
        where('createdBy', '==', currentUser.uid),
      );
      const querySnapshot = await getDocs(q);
      this.availableStops = querySnapshot.docs.map((docSnapshot) => {
        const data = docSnapshot.data();
        const model = DropOffDataModel.fromFirestore(data);
        (model as any).id = docSnapshot.id; // Type assertion since id is added
        return model;
      });
      console.log('Loaded available stops:', this.availableStops.length); // Debug log
      this.updateUniqueProducts();
      this.updateFilters();
    } catch (err) {
      console.error('Error loading pending stops:', err);
      Swal.fire('Erreur', 'Impossible de charger les arrêts disponibles.', 'error');
    }
  }

  updateUniqueProducts() {
    const products = [...new Set(this.availableStops.filter(s => s.expeditorId && s.expeditorId.trim() !== '').map(s => s.productName).filter(p => p))];
    this.uniqueProducts = products.sort();
  }

  getFilteredAvailable(): DropOffDataModel[] {
    const minPrice = this.filterPriceMin || 0;
    const maxPrice = this.filterPriceMax !== null ? this.filterPriceMax : Infinity;
    return this.availableStops.filter(stop => {
      const hasExpeditor = stop.expeditorId && stop.expeditorId.trim() !== '';
      const govMatch = !this.filterGov || stop.gov === this.filterGov;
      const productMatch = !this.filterProduct || stop.productName === this.filterProduct;
      const priceMatch = minPrice <= (stop.price || 0) && (stop.price || 0) <= maxPrice;
      return hasExpeditor && govMatch && productMatch && priceMatch;
    });
  }

  getFilteredAndSortedAvailable(): DropOffDataModel[] {
    let filtered = this.getFilteredAvailable();
    if (this.sortColumn) {
      filtered = filtered.sort((a, b) => {
        let aVal = (a as any)[this.sortColumn] || '';
        let bVal = (b as any)[this.sortColumn] || '';
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return this.sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
        }
        aVal = (aVal as string).toLowerCase();
        bVal = (bVal as string).toLowerCase();
        if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }
    this.selectAllFiltered = filtered.every(s => this.selectedStopIds.has((s as any).id));
    return filtered;
  }

  updateFilters() {
    if (this.filterPriceMin > 0 && this.filterPriceMax !== null && this.filterPriceMin > this.filterPriceMax) {
      this.filterPriceMax = this.filterPriceMin;
    }
    this.selectAllFiltered = false;
    this.selectAllGlobal = false;
  }

  sortBy(column: string) {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
  }

  selectAllGlobalFn(checked: boolean) {
    const validStops = this.availableStops.filter(s => s.expeditorId && s.expeditorId.trim() !== '');
    validStops.forEach(s => {
      if (checked) this.selectedStopIds.add((s as any).id);
      else this.selectedStopIds.delete((s as any).id);
    });
    this.selectAllFiltered = checked;
  }

  toggleStop(id: string) {
    if (this.selectedStopIds.has(id)) {
      this.selectedStopIds.delete(id);
    } else {
      this.selectedStopIds.add(id);
    }
    this.selectAllFiltered = false;
    this.selectAllGlobal = false;
  }

  selectAll(checked: boolean) {
    const filtered = this.getFilteredAvailable();
    filtered.forEach(s => {
      if (checked) this.selectedStopIds.add((s as any).id);
      else this.selectedStopIds.delete((s as any).id);
    });
    this.selectAllGlobal = false;
  }

  addSelectedToDropOffs() {
    const selected = this.availableStops.filter(s => this.selectedStopIds.has((s as any).id));
    if (selected.length === 0) return;
    const newCount = this.dropOffs.length;
    this.dropOffs.push(...selected);
    if (this.dropOffs.length > this.maxStops) {
      this.dropOffs = this.dropOffs.slice(0, this.maxStops);
      Swal.fire('Limite atteinte', `Seulement ${this.maxStops} arrêts autorisés. ${selected.length - (this.maxStops - newCount)} ont été ignorés.`, 'warning');
    }
    this.selectedStopIds.clear();
    this.updateTSP();
    // FIXED: Save serialized data with ID preserved for all
    this.cache.dropOffs = this.dropOffs.map(d => ({ ...d.toFirestore(), id: (d as any).id }));
    this.cache.saveToLocalStorage();
    Swal.fire('Succès', `${selected.length} arrêts ajoutés à la route.`, 'success');
  }

  /** ------------------- PHONE NORMALIZATION ------------------- **/
  private normalizePhoneNumber(phone: string): string | null {
    if (!phone || typeof phone !== 'string') return null;
    // Remove all non-digits
    const digitsOnly = phone.replace(/\D/g, '');
    // Check if it starts with 216 (Tunisian country code)
    let normalized = digitsOnly;
    if (digitsOnly.startsWith('216')) {
      normalized = digitsOnly.substring(3);
    }
    // Ensure exactly 8 digits remain
    if (normalized.length === 8 && /^\d{8}$/.test(normalized)) {
      return normalized;
    }
    // Invalid: return null (e.g., "alis" or wrong length/format)
    return null;
  }

  /** ------------------- DRIVER LOGIC ------------------- **/
  loadMyDriverIds() {
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    const userDoc = doc(this.firestore, 'users', currentUser.uid);
    docData(userDoc).subscribe(async (companyData: any) => {
      if (companyData?.drivers?.length) {
        this.myDriverIds = companyData.drivers;
        console.log('Company driver IDs:', this.myDriverIds);
        // Fetch full driver data
        this.driversof = await this.loadDriversByIds(this.myDriverIds);
        console.log('Loaded driver data:', this.driversof);
        this.filterDrivers();
      } else {
        this.myDriverIds = [];
        this.driversof = [];
        this.filteredDrivers = [];
        console.log('No drivers found for this company.');
      }
    });
  }

  filterDrivers() {
    if (!this.driverSearch) {
      this.filteredDrivers = [...this.driversof];
    } else {
      const searchLower = this.driverSearch.toLowerCase();
      this.filteredDrivers = this.driversof.filter(d =>
        d.name.toLowerCase().includes(searchLower) || d.phone.includes(searchLower)
      );
    }
  }

  async loadDriversByIds(driverIds: string[]): Promise<ShnellUser[]> {
    if (!driverIds || driverIds.length === 0) return [];
    const drivers: ShnellUser[] = [];
    const promises = driverIds.map(async (id) => {
      const driverDocRef = doc(this.firestore, 'users', id);
      const driverData = await firstValueFrom(docData(driverDocRef));
      if (driverData) {
        // Fix: Include the document ID in the data for the model
        const dataWithId = { ...driverData, id: id };
        drivers.push(ShnellUser.fromJson(dataWithId));
      }
    });
    await Promise.all(promises);
    return drivers;
  }

  selectDriver(index: number) {
    this.selectedDriverIndex = index;
    this.selectedDriverId = this.myDriverIds[index];
    console.log('Driver selected:', this.driversof[index]);
  }

  // Excel upload handler (updated to work with hidden input)
  async onExcelUpload(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    if (!file.name.match(/\.(xlsx|xls)$/)) {
      this.errorMessage = '❌ Fichier Excel requis (.xlsx ou .xls)';
      return;
    }
    this.excelFile = file;
    this.isProcessingExcel = true;
    this.processedRows = 0;
    this.totalRows = 0;
    this.errorMessage = null;
    try {
      await this.processExcelFile(file);
    } catch (err) {
      this.errorMessage = '❌ Erreur lors du traitement du fichier Excel';
      console.error(err);
    } finally {
      this.isProcessingExcel = false;
      this.fileInput.nativeElement.value = ''; // Reset hidden input
    }
  }

  // Process Excel file (smart field identification, handles >3 columns, skips missing data, selects largest sheet)
  private async processExcelFile(file: File) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      if (workbook.SheetNames.length === 0) {
        this.errorMessage = '❌ Fichier Excel vide ou sans feuilles';
        return;
      }
      // Smart sheet selection: Choose the sheet with the most data rows
      let maxRows = 0;
      let selectedSheetName = workbook.SheetNames[0];
      for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        if (!sheet) continue;
        const sheetRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }).length;
        if (sheetRows > maxRows) {
          maxRows = sheetRows;
          selectedSheetName = sheetName;
        }
      }
      const selectedSheet = workbook.Sheets[selectedSheetName];
      const rows = XLSX.utils.sheet_to_json(selectedSheet, { header: 1 }) as string[][];
      if (rows.length <= 1) {
        this.errorMessage = '❌ Feuille sélectionnée vide ou sans données';
        return;
      }
      const headers = rows[0].map(h => h?.toString().trim().toLowerCase()); // Normalize headers
      this.totalRows = rows.length - 1; // Exclude header
      this.processedRows = 0;
      // Smart column mapping: Identify by header names (flexible, case-insensitive)
      const nameCol = headers.findIndex(h => h && (h.includes('name') || h.includes('nom') || h.includes('client')));
      const phoneCol = headers.findIndex(h => h && (h.includes('phone') || h.includes('téléphone') || h.includes('tel')));
      const destCol = headers.findIndex(h => h && (h.includes('address') || h.includes('adresse') || h.includes('dest') || h.includes('location')));
      const govCol = headers.findIndex(h => h && (h.includes('gov') || h.includes('gouvernorat')));
      const descCol = headers.findIndex(h => h && (h.includes('desc') || h.includes('note') || h.includes('article') || h.includes('colis')));
      const priceCol = headers.findIndex(h => h && (h.includes('prix') || h.includes('price') || h.includes('montant') || h.includes('cod')));
      const expeditorCol = headers.findIndex(h => h && (h.includes('expedit') || h.includes('sender') || h.includes('expéd') || h.includes('vendeur') || h.includes('boutique')));
      if (destCol === -1) {
        this.errorMessage = '❌ Colonne "Adresse" ou "Destination" non trouvée';
        return;
      }
      let addedCount = 0;
      for (let i = 1; i < rows.length; i++) { // Skip header
        if (this.dropOffs.length >= this.maxStops) {
          console.warn(`Reached max stops (${this.maxStops}), stopping at row ${i + 1}`);
          break;
        }
        const row = rows[i];
        if (row.length === 0) continue; // Skip empty rows
        const destination = row[destCol]?.toString().trim();
        if (!destination) {
          console.warn(`Row ${i + 1} missing destination, skipping`);
          continue;
        }
        // Optional fields (no force; default empty) - add even if missing
        const name = nameCol >= 0 ? row[nameCol]?.toString().trim() || '' : '';
        const rawPhone = phoneCol >= 0 ? row[phoneCol]?.toString().trim() || '' : '';
        const normalizedPhone = this.normalizePhoneNumber(rawPhone);
        // Professional import requires a valid phone per stop — skip rows without one.
        if (!normalizedPhone) {
          console.warn(`Row ${i + 1} has no valid phone number, skipping`);
          continue;
        }
        const gov = govCol >= 0 ? row[govCol]?.toString().trim() || '' : '';
        const description = descCol >= 0 ? row[descCol]?.toString().trim() || '' : '';
        const expeditor = expeditorCol >= 0 ? row[expeditorCol]?.toString().trim() || '' : '';
        const parcelPriceRaw = priceCol >= 0 ? Number(row[priceCol]?.toString().replace(',', '.')) : NaN;
        const parcelPrice = isFinite(parcelPriceRaw) && parcelPriceRaw > 0 ? parcelPriceRaw : undefined;
        // Geocode with full fallback system (Nominatim/Mapbox/Google)
        const geocodeResult = await this.geocodeAddress(destination);
        if (!geocodeResult) {
          console.warn(`Geocoding failed for row ${i + 1}: ${destination}`);
          continue;
        }
        // Create DropOffDataModel and add to dropOffs
        const dropOff = new DropOffDataModel(
          new LatLng(geocodeResult.lat, geocodeResult.lng),
          geocodeResult.formatted_address,
          name || undefined,
          normalizedPhone,
          undefined, // state defaults to 'pending'
          gov || undefined,
          expeditor || undefined, // expeditorId
          undefined, // price
          undefined, // productName
          undefined, // quantity
          description || undefined,
          undefined, // receiverPhone2
          parcelPrice,
        );
        this.dropOffs.push(dropOff);
        this.processedRows++;
        addedCount++;
        // Update UI (force change detection)
        this.ngZone.run(() => {});
        // Rate limit: Reduced delay for better UX, but still respectful (0.5s)
        if (i < rows.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
      console.log(`Processed ${this.processedRows}/${this.totalRows} rows successfully (added ${addedCount} stops)`);
      if (this.processedRows === 0) {
        this.errorMessage = '❌ Aucune ligne valide trouvée dans le fichier';
      } else {
        this.updateTSP(); // Refresh ordered stops
        // FIXED: Save serialized data (new stops have no ID)
        this.cache.dropOffs = this.dropOffs.map(d => ({ ...d.toFirestore(), id: (d as any).id }));
        this.cache.saveToLocalStorage();
        Swal.fire({
          title: 'Import Success!',
          text: `${addedCount} arrêts ajoutés depuis Excel (même avec champs optionnels manquants).`,
          icon: 'success',
          timer: 2000,
          showConfirmButton: false
        });
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /** ------------------- PICKUP LOGIC ------------------- **/
  async setSmartPickup(input: string | any) {
    if (!input) {
      alert('Pickup address is required');
      return;
    }
    try {
      let latLng: LatLng | null = null;
      let destinationName: string = '';
      if (typeof input === 'string' && input.startsWith('http')) {
        const atMatch = input.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        const coordMatch = input.match(/3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
        if (coordMatch) {
          const parsedLat = parseFloat(coordMatch[1]);
          const parsedLng = parseFloat(coordMatch[2]);
          if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
            latLng = new LatLng(parsedLat, parsedLng);
          }
        } else if (atMatch) {
          const parsedLat = parseFloat(atMatch[1]);
          const parsedLng = parseFloat(atMatch[2]);
          if (!isNaN(parsedLat) && !isNaN(parsedLng)) {
            latLng = new LatLng(parsedLat, parsedLng);
          }
        }
        if (!latLng) {
          Swal.fire({ icon: 'error', title: 'Invalid URL', text: 'No coordinates found in Google Maps URL.' });
          return;
        }
        const nameMatch = input.match(/\/place\/([^\/@]+)\//);
        destinationName = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : 'Unknown place';
      } else {
        // Treat as address string
        const address = typeof input === 'string' ? input : '';
        if (!address) {
          Swal.fire({ icon: 'error', title: 'Oops...', text: 'Valid address required' });
          return;
        }
        const geocoded = await this.geocodeAddress(address);
        if (!geocoded) {
          Swal.fire({ icon: 'error', title: 'Oops...', text: 'Address not found in Tunisia' });
          return;
        }
        latLng = new LatLng(geocoded.lat, geocoded.lng);
        destinationName = geocoded.formatted_address;
      }
      // Now latLng is guaranteed valid - set pickup
      this.pickupAddress = destinationName;
      this.pickupLatLng = latLng;
      // Cache it
      this.cache.pickupAddress = this.pickupAddress;
      this.cache.pickupLatLng = this.pickupLatLng;
      this.cache.saveToLocalStorage();
      this.updateTSP();
      Swal.fire({
        icon: "success",
        title: "Pickup Set!",
        text: "Pickup location updated successfully.",
        timer: 1500,
        showConfirmButton: false
      });
    } catch (err) {
      console.error(err);
      Swal.fire({ icon: 'error', title: 'Oops...', text: 'Error setting pickup!' });
    }
  }

  async deleteAvailableStop(id: string) {
    Swal.fire({
      title: 'Supprimer cet arrêt ?',
      text: 'Cette action supprimera l\'arrêt de la base de données définitivement !',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Oui, supprimer !',
      cancelButtonText: 'Annuler'
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          await deleteDoc(doc(this.firestore, 'stops', id));
          // Remove from local list
          this.availableStops = this.availableStops.filter(s => (s as any).id !== id);
          this.selectedStopIds.delete(id);
          this.updateUniqueProducts();
          this.updateFilters();
          Swal.fire('Supprimé !', 'L\'arrêt a été supprimé de la base.', 'success');
        } catch (err) {
          console.error('Delete failed:', err);
          Swal.fire('Erreur', 'Impossible de supprimer l\'arrêt.', 'error');
        }
      }
    });
  }
  setPickup(place: any) {
    this.setSmartPickup(place);
  }

  /** ------------------- DROP-OFF LOGIC ------------------- **/
  setDropOff(place: any) {
    if (!place?.geometry?.location) return;
    const drop = new DropOffDataModel(
      new LatLng(place.geometry.location.lat(), place.geometry.location.lng()),
      place.formatted_address
    );
    if (this.dropOffs.length < this.maxStops) this.dropOffs.push(drop);
    // FIXED: Save serialized data
    this.cache.dropOffs = this.dropOffs.map(d => ({ ...d.toFirestore(), id: (d as any).id }));
    this.cache.saveToLocalStorage();
    this.updateTSP();
  }

  getMapboxPrecision(feature: any): 'high' | 'medium' | 'low' {
    const type = feature.place_type[0]; // Mapbox always returns an array
    if (type === 'address') return 'high';
    if (type === 'poi') return 'medium';
    return 'low';
  }

  async addDropOff() {
    if (!this.newDropOffDestination || this.dropOffs.length >= this.maxStops) return;

    // Professional data entry requires at least one valid phone number per stop.
    const primaryPhone = this.normalizePhoneNumber(this.newDropOffPhone);
    if (!primaryPhone) {
      Swal.fire('Erreur', 'Au moins un numéro de téléphone valide (8 chiffres) est requis.', 'error');
      return;
    }

    let latLng: LatLng;
    let destinationName: string;
    try {
      if (this.newDropOffDestination.startsWith('http')) {
        const atMatch = this.newDropOffDestination.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
        const coordMatch = this.newDropOffDestination.match(/3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
        if (coordMatch) {
          latLng = new LatLng(parseFloat(coordMatch[1]), parseFloat(coordMatch[2]));
        } else if (atMatch) {
          latLng = new LatLng(parseFloat(atMatch[1]), parseFloat(atMatch[2]));
        } else {
          return;
        }
        const nameMatch = this.newDropOffDestination.match(/\/place\/([^\/@]+)\//);
        destinationName = nameMatch ? decodeURIComponent(nameMatch[1].replace(/\+/g, ' ')) : 'Unknown place';
      } else {
        const geocoded = await this.geocodeAddress(this.newDropOffDestination);
        if (!geocoded) {
          Swal.fire({
            icon: "error",
            title: "Oops...",
            text: "Address not found in Tunisia",
          });
          return;
        }
        latLng = new LatLng(geocoded.lat, geocoded.lng);
        destinationName = geocoded.formatted_address;
      }
      const drop = new DropOffDataModel(
        latLng,
        destinationName,
        this.newDropOffName || undefined,
        primaryPhone,
        undefined, // state defaults to 'pending'
        this.newDropOffGov || undefined,
        this.newDropOffExpeditor.trim() || undefined, // expeditorId
        undefined, // price
        undefined, // productName
        undefined, // quantity
        this.newDropOffDescription.trim() || undefined,
        this.normalizePhoneNumber(this.newDropOffPhone2) ?? undefined,
        (this.newDropOffParcelPrice != null && !isNaN(Number(this.newDropOffParcelPrice)))
          ? Number(this.newDropOffParcelPrice) : undefined,
      );
      // Fixed: Single if-block, no duplicate
      if (this.editIndex !== null) {
        this.dropOffs[this.editIndex] = drop;
        this.editIndex = null;
      } else {
        this.dropOffs.push(drop);
      }
      // Save - FIXED: Save serialized data
      this.cache.dropOffs = this.dropOffs.map(d => ({ ...d.toFirestore(), id: (d as any).id }));
      this.cache.saveToLocalStorage();
      this.resetInputs();
      this.updateTSP();
    } catch (err) {
      console.error(err);
      Swal.fire({
        icon: "error",
        title: "Oops...",
        text: "Error adding stop!",
      });
    }
  }

  editStop(index: number) {
    const stop = this.dropOffs[index];
    this.newDropOffName = stop.name || '';
    this.newDropOffPhone = stop.phoneNumber || ''; // Display the normalized version (8 digits)
    this.newDropOffPhone2 = stop.receiverPhone2 || '';
    this.newDropOffDestination = stop.destinationName;
    this.newDropOffGov = stop.gov || '';
    this.newDropOffDescription = stop.description || '';
    this.newDropOffParcelPrice = stop.parcelPrice ?? null;
    this.newDropOffExpeditor = stop.expeditorId || '';
    this.editIndex = index;
  }

  deleteStop(index: number) {
    Swal.fire({
      title: "Delete this stop?",
      text: "You won't be able to revert this!",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#3085d6",
      cancelButtonColor: "#d33",
      confirmButtonText: "Yes, delete it!"
    }).then((result) => {
      if (result.isConfirmed) {
        this.dropOffs.splice(index, 1);
        if (this.editIndex === index) this.resetInputs();
        else if (this.editIndex !== null && this.editIndex > index) this.editIndex--;
        // FIXED: Save serialized data
        this.cache.dropOffs = this.dropOffs.map(d => ({ ...d.toFirestore(), id: (d as any).id }));
        this.cache.saveToLocalStorage();
        this.updateTSP();
        Swal.fire({
          title: "Deleted!",
          text: "Your stop has been deleted.",
          icon: "success"
        });
      }
    });
  }
// Add this method to the component class

async deleteSelectedStops() {
  const count = this.selectedStopIds.size;
  if (count === 0) return;

  const result = await Swal.fire({
    title: 'Supprimer les arrêts sélectionnés ?',
    text: `Êtes-vous sûr de vouloir supprimer ${count} arrêts de la base de données définitivement ?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#d33',
    cancelButtonColor: '#3085d6',
    confirmButtonText: 'Oui, supprimer !',
    cancelButtonText: 'Annuler'
  });

  if (result.isConfirmed) {
    try {
      const deletePromises = Array.from(this.selectedStopIds).map(id =>
        deleteDoc(doc(this.firestore, 'stops', id))
      );
      await Promise.all(deletePromises);

      // Remove from local list
      this.availableStops = this.availableStops.filter(s => !this.selectedStopIds.has((s as any).id));
      this.selectedStopIds.clear();

      this.updateUniqueProducts();
      this.updateFilters();

      Swal.fire({
        title: 'Supprimés !',
        text: `${count} arrêts ont été supprimés de la base.`,
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });
    } catch (err) {
      console.error('Bulk delete failed:', err);
      Swal.fire('Erreur', 'Impossible de supprimer certains arrêts.', 'error');
    }
  }
}
  resetInputs() {
    this.newDropOffName = '';
    this.newDropOffPhone = '';
    this.newDropOffPhone2 = '';
    this.newDropOffDestination = '';
    this.newDropOffGov = '';
    this.newDropOffDescription = '';
    this.newDropOffParcelPrice = null;
    this.newDropOffExpeditor = '';
    this.editIndex = null;
  }

  /** ------------------- GEOCODING ------------------- **/
  async geocodeAddress(address: string): Promise<{ lat: number; lng: number; formatted_address: string } | null> {
    const cacheKey = address.trim().toLowerCase();
    // Return pending promise if already geocoding this address
    if (this.geocodingCache.has(cacheKey)) {
      console.log(`Returning cached geocoding for: ${address}`);
      return this.geocodingCache.get(cacheKey)!;
    }
    const promise = (async () => {
      try {
        const hit = await mapboxGeocodeOne(address);
        if (hit) return hit;
        console.warn('No geocoding results found for', address);
        return null;
      } catch (err) {
        console.error('Geocoding error:', err);
        return null;
      } finally {
        this.geocodingCache.delete(cacheKey);
      }
    })();
    this.geocodingCache.set(cacheKey, promise);
    return promise;
  }

  /** ------------------- TSP UI UPDATE ------------------- **/
  private getOrderedStops(): DropOffDataModel[] {
    if (!this.pickupLatLng || this.dropOffs.length === 0) return [];
    const stopsData = this.dropOffs.map((d, index) => ({
      id: index.toString(),
      lat: d.destination.lat,
      lng: d.destination.lng
    }));
    const orderedIds = this.reorderStops(this.pickupLatLng, stopsData);
    return orderedIds.map(id => this.dropOffs[parseInt(id)]);
  }

  async chargeCompany(totalCost: number): Promise<'success' | 'fail'> {
    const firestore = getFirestore();
    const auth = getAuth();
    const currentUser = auth.currentUser;
    if (!currentUser) return 'fail';
    const companyDocRef = doc(firestore, 'users', currentUser.uid); // Company stored under users collection
    try {
      await runTransaction(firestore, async (transaction) => {
        const companySnap = await transaction.get(companyDocRef);
        if (!companySnap.exists()) throw new Error('Company not found');
        const data = companySnap.data();
        const balance = Number(data?.['balance']) || 0;
        if (balance < totalCost) throw new Error('Insufficient funds');
        transaction.update(companyDocRef, { balance: balance - totalCost });
      });
      return 'success';
    } catch (err) {
      console.error('Charge failed:', err);
      return 'fail';
    }
  }

  updateTSP() {
    this.orderedDropOffs = this.getOrderedStops();
  }

  // inside PartnerdashComponent
  get totalCost(): number {
    const payrate = this.companyPayrate ?? 0.25; // Fallback if not loaded yet
    return this.dropOffs.length * payrate;
  }

  // Add a property to store company payrate (load from Firestore)
  companyPayrate: number | null = null;

  /** ------------------- ORDER CONFIRMATION ------------------- **/
  isprocessed = false;

  async confirmAll() {
    if (!this.pickupLatLng) {
      Swal.fire({
        icon: "error",
        title: "Oops...",
        text: "Pickup address is required",
      });
      return;
    }
    if (this.selectedDriverId === null) {
      Swal.fire({
        icon: "error",
        title: "Oops...",
        text: "Please assign a driver first!",
      });
      return;
    }
    const totalCost = this.totalCost;
    if (totalCost > 0) {
      const ispaid = await this.chargeCompany(totalCost);
      if (ispaid === 'fail') {
        Swal.fire({
          title: "Insufficient balance to cover delivery cost. Please top up your account.",
          icon: "error",
          draggable: true
        });
        return;
      }
    }

    try {
      this.isprocessed = true;
      const auth = getAuth();
      const userId = auth.currentUser?.uid;
      if (!userId) {
        throw new Error('No authenticated user');
      }

      // FIXED: Ensure all drops are proper instances before processing (using fromFirestore for accuracy)
      this.dropOffs = this.dropOffs.map(drop => this.ensureDropOffInstance(drop));

      const dropOffIds: string[] = [];
      const dropOffCollection = collection(this.firestore, 'stops');

      // Granular try-catch for stops
      try {
        for (const drop of this.dropOffs) {
          let stopId: string;
          if ((drop as any).id) {
            // Existing stop
            stopId = (drop as any).id;
          } else {
            // New stop - Now guaranteed to have toFirestore via reconstruction
            let docData = drop.toFirestore();
            docData.createdBy = userId;
            docData.companyId = userId;
            docData.definedBy = userId; // professional user who created this stop
            if (!docData.expeditorPayout) docData.expeditorPayout = 'unpaid';
            // FIXED: Clean undefined values to null to prevent Firestore error
            docData = Object.fromEntries(
              Object.entries(docData).map(([key, value]) => [key, value === undefined ? null : value])
            );
            const docRef = await addDoc(dropOffCollection, docData);
            stopId = docRef.id;
            (drop as any).id = stopId; // Set for cache
          }
          dropOffIds.push(stopId);
        }
      } catch (stopsErr: any) {
        console.error('Stops save failed:', stopsErr);
        throw new Error(`Failed to save stops: ${stopsErr.message || stopsErr}`);
      }

      // Prepare order data
      const stopsData = this.dropOffs.map((d, i) => ({
        id: dropOffIds[i],
        lat: d.destination.lat,
        lng: d.destination.lng
      }));
      const optimizedStopIds = this.reorderStops(this.pickupLatLng!, stopsData);

      const orderCollection = collection(this.firestore, 'orders');

      // Granular try-catch for order
      try {
        const orderRef = doc(orderCollection);
        const orderId = orderRef.id;
        await setDoc(orderRef, {
          id: orderId,
          price: totalCost,
          distance: 0,  // Can compute later if needed
          namePickUp: this.pickupAddress,
          // GeoJSON: [longitude, latitude] — matches every reader (Orders.fromFirestore).
          pickUpLocation: {
            coordinates: [this.pickupLatLng.lng, this.pickupLatLng.lat],
            type: 'Point',
          },
          stops: optimizedStopIds,  // Array of stop IDs (strings)
          userID: userId,
          category: 'eco',
          currencyCode: 'TND',
          optionalAssets: [],
          budget: 0,
          notes: null,
          scheduleAt: Timestamp.now(),
          isAccepted: false,
          isAcepted: false,       // legacy mirror (client pending-screen query)
          isBiddingMode: false,
          isAdministrative: true, // company-assigned -> driver in-app calling hidden
          chosenDriver: this.selectedDriverId,
          timestamp: Timestamp.now()
        });

        // Push the job into the chosen driver's inbox so it actually reaches them
        // (the driver app reads users/{uid}/assigned_jobs, never orders.chosenDriver).
        if (this.selectedDriverId) {
          await addDoc(collection(this.firestore, 'users', this.selectedDriverId, 'assigned_jobs'), {
            orderId,
            category: 'eco',
            status: 'pending',
            assignedAt: serverTimestamp(),
          }).catch(err => console.warn('assigned_jobs write failed:', err));
        }
      } catch (orderErr: any) {
        console.error('Order save failed:', orderErr);
        throw new Error(`Failed to save order: ${orderErr.message || orderErr}`);
      }

      Swal.fire({
        title: "Order and stops successfully saved!",
        icon: "success",
        draggable: true
      });

      // Clear cache and state only on success
      this.isprocessed = false;
      this.cache.dropOffs = [];
      this.cache.pickupAddress = '';
      this.cache.pickupLatLng = null;
      this.cache.selectedDriverId = null;
      this.cache.selectedDriverIndex = null;
      this.cache.saveToLocalStorage();
      this.dropOffs = [];
      this.pickupAddress = '';
      this.pickupLatLng = null;
      this.selectedDriverIndex = null;
      this.selectedDriverId = null;
      this.currentStep = 1;
      this.updateTSP();
    } catch (err: any) {
      console.error('Detailed confirmAll error:', err.message, err.stack);  // Enhanced logging
      this.isprocessed = false;
      Swal.fire({
        icon: "error",
        title: "Oops...",
        text: err.message || "Failed to save order/stops. Check console for details.",
      });
    }
  }

  reorderStops(pickup: LatLng, stops: { id: string, lat: number, lng: number }[]): string[] {
    const remaining = [...stops];
    const orderedIds: string[] = [];
    let current = { lat: pickup.lat, lng: pickup.lng };
    while (remaining.length > 0) {
      let nearestIndex = 0;
      let nearestDistance = this.distance(current, remaining[0]);
      for (let i = 1; i < remaining.length; i++) {
        const dist = this.distance(current, remaining[i]);
        if (dist < nearestDistance) {
          nearestDistance = dist;
          nearestIndex = i;
        }
      }
      const nextStop = remaining.splice(nearestIndex, 1)[0];
      orderedIds.push(nextStop.id);
      current = { lat: nextStop.lat, lng: nextStop.lng };
    }
    return orderedIds;
  }

  distance(a: { lat: number, lng: number }, b: { lat: number, lng: number }): number {
    const R = 6371; // Earth radius in km
    const dLat = (b.lat - a.lat) * Math.PI / 180;
    const dLon = (b.lng - a.lng) * Math.PI / 180;
    const lat1 = a.lat * Math.PI / 180;
    const lat2 = b.lat * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2 +
      Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  // Call this whenever pickup or stops change
}
