import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-download-redirect',
  templateUrl: './download-redirect.component.html',
  styleUrl: './download-redirect.component.css'
})
export class DownloadRedirectComponent implements OnInit {
  playStoreUrl = 'https://play.google.com/store/apps/details?id=com.shnell.app';
  directApkUrl = 'https://play.google.com/store/apps/details?id=com.shnell.app';

  ngOnInit(): void {
  //  window.location.href = this.playStoreUrl;
  }
}
