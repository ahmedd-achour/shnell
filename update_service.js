const fs = require('fs');

const servicePath = 'src/app/shnell-dashboard/services/dashboard-data.service.ts';
let serviceContent = fs.readFileSync(servicePath, 'utf8');

if (!serviceContent.includes('getCallLogs()')) {
  // First, add CallLog to imports from models
  serviceContent = serviceContent.replace('CountryServiceArea,', 'CountryServiceArea,\n    CallLog,');

  const addMethod = `
  getCallLogs(): Observable<CallLog[]> {
    const colRef = collection(this.firestore, 'call_logs');
    return collectionData(colRef, { idField: 'id' }).pipe(
      map(list => list as CallLog[]),
      startWith([]),
      catchError(err => {
        console.error('Error fetching call logs:', err);
        return of([]);
      })
    );
  }
`;
  serviceContent = serviceContent.replace('getBids(driverId?: string): Observable<Bid[]> {', addMethod + '\n  getBids(driverId?: string): Observable<Bid[]> {');
  
  // also add assignDriver function
  const assignDriverFunc = `
  async assignDriverToOrder(orderId: string, driverId: string, userId: string): Promise<void> {
    try {
      const orderRef = doc(this.firestore, 'orders', orderId);
      await updateDoc(orderRef, { isAcepted: true });

      const dealRef = doc(collection(this.firestore, 'deals'));
      await setDoc(dealRef, {
        idOrder: orderId,
        idDriver: driverId,
        idUser: userId,
        status: 'accepted',
        timestamp: serverTimestamp()
      });
      
      const notifRef = doc(collection(this.firestore, 'notifications'));
      await setDoc(notifRef, {
        userId: driverId,
        title: 'New Job Assigned',
        body: 'Admin has manually assigned you a job.',
        time: serverTimestamp(),
        isRead: false,
        type: 'assignment'
      });
    } catch (e) {
      console.error('Failed to assign driver:', e);
      throw e;
    }
  }
`;
  serviceContent = serviceContent.replace('async softDeleteOrder(orderId: string): Promise<void> {', assignDriverFunc + '\n  async softDeleteOrder(orderId: string): Promise<void> {');

  fs.writeFileSync(servicePath, serviceContent, 'utf8');
  console.log('Added getCallLogs and assignDriverToOrder');
}
