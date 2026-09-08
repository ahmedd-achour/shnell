import { Component, HostListener } from '@angular/core';

interface NavItem {
  label: string;
  path: string;
}

@Component({
  selector: 'app-header',
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css']
})
export class HeaderComponent {
  isMenuOpen = false;
  scrolled = false;
  private documentClickListener?: (event: MouseEvent) => void;

  navItems: NavItem[] = [
    { label: 'Accueil', path: '/home' },
    { label: 'À Propos', path: '/about' },
    { label: 'Services', path: '/service' },
    { label: 'Contact', path: '/contact' },
  ];

  @HostListener('window:scroll')
  onScroll(): void {
    this.scrolled = window.scrollY > 8;
  }

  toggleMenu() {
    if (this.isMenuOpen) {
      this.closeMenu();
    } else {
      this.openMenu();
    }
  }

  private openMenu() {
    this.isMenuOpen = true;
    const collapse = document.getElementById('navbarCollapse');
    collapse?.classList.add('show');
    document.body.classList.add('no-scroll');
    this.documentClickListener = this.handleDocumentClick.bind(this);
    document.addEventListener('click', this.documentClickListener);
  }

  closeMenu() {
    this.isMenuOpen = false;
    const collapse = document.getElementById('navbarCollapse');
    collapse?.classList.remove('show');
    document.body.classList.remove('no-scroll');
    if (this.documentClickListener) {
      document.removeEventListener('click', this.documentClickListener);
      this.documentClickListener = undefined;
    }
  }

  private handleDocumentClick(event: MouseEvent) {
    const sidebar = document.getElementById('navbarCollapse');
    const toggler = document.querySelector('.navbar-toggler');
    if (sidebar && toggler && !sidebar.contains(event.target as Node) && !toggler.contains(event.target as Node)) {
      this.closeMenu();
    }
  }
}
