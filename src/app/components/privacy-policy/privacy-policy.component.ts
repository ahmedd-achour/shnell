import { Component } from '@angular/core';
import { PRIVACY_POLICY, PolicyLang, PolicySection } from './privacy-policy.content';

type Lang = 'fr' | 'en';

@Component({
  selector: 'app-privacy-policy',
  templateUrl: './privacy-policy.component.html',
  styleUrls: ['./privacy-policy.component.css'],
})
export class PrivacyPolicyComponent {
  lang: Lang = 'fr';

  get policy(): PolicyLang {
    return PRIVACY_POLICY[this.lang];
  }

  get crumbLabel(): string {
    return this.lang === 'fr' ? 'Politique de confidentialité' : 'Privacy policy';
  }

  get footerNote(): string {
    return this.lang === 'fr'
      ? "En utilisant les applications et la plateforme web Shnell, vous confirmez avoir lu, compris et accepté cette Politique de confidentialité."
      : 'By using the Shnell apps and web platform, you confirm that you have read, understood and accepted this Privacy Policy.';
  }

  setLang(l: Lang): void {
    this.lang = l;
  }

  /** Section body → sanitised-safe HTML. Supports the arb markdown subset:
   *  blank-line paragraphs, "- " bullet lists, "1." ordered lists, **bold**,
   *  bare URLs and e-mail addresses. Angular's [innerHTML] sanitizer keeps the
   *  resulting <p>/<ul>/<ol>/<li>/<strong>/<a> tags and drops anything else. */
  toHtml(section: PolicySection): string {
    const blocks = section.b.split(/\n{2,}/);
    return blocks.map(raw => this.blockToHtml(raw.trim())).filter(Boolean).join('');
  }

  private blockToHtml(block: string): string {
    if (!block) return '';
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);

    if (lines.every(l => /^-\s+/.test(l))) {
      return `<ul>${lines.map(l => `<li>${this.inline(l.replace(/^-\s+/, ''))}</li>`).join('')}</ul>`;
    }
    if (lines.every(l => /^\d+\.\s+/.test(l))) {
      return `<ol>${lines.map(l => `<li>${this.inline(l.replace(/^\d+\.\s+/, ''))}</li>`).join('')}</ol>`;
    }
    return `<p>${lines.map(l => this.inline(l)).join('<br>')}</p>`;
  }

  private inline(text: string): string {
    let s = this.escape(text);
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // e-mail addresses
    s = s.replace(/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g, '<a href="mailto:$1">$1</a>');
    // bare www. / http(s) URLs (not already inside an href)
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s)<]+|www\.[^\s)<]+)/g, (_m, pre, url) => {
      const href = url.startsWith('http') ? url : `https://${url}`;
      return `${pre}<a href="${href}" target="_blank" rel="noopener">${url}</a>`;
    });
    return s;
  }

  private escape(s: string): string {
    return s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
