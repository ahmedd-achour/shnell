import { AfterViewChecked, Component, ElementRef, EventEmitter, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminHubService, AssistantStep, AssistantTurn } from '../../services/admin-hub.service';

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  html?: string;
  steps?: AssistantStep[];
  error?: boolean;
  showSteps?: boolean;
}

const STORE_KEY = 'shnell_admin_assistant_v1';

/**
 * Admin assistant: ask anything about the app ("chkoun 3amel login lyoum ?",
 * "9adeh 3ana men transporteur actif ?") and Gemini answers from live data
 * through the read-only tools of functions/lib/admin_assistant.js. Every
 * answer lists the queries it ran.
 */
@Component({
  selector: 'app-assistant-tab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './assistant-tab.component.html',
  styleUrls: ['../../hub.css', './assistant-tab.component.css'],
})
export class AssistantTabComponent implements AfterViewChecked {
  @Output() openAccount = new EventEmitter<string>();
  @ViewChild('scroller') scroller?: ElementRef<HTMLDivElement>;

  messages: ChatMessage[] = [];
  draft = '';
  busy = false;
  private stick = false;

  readonly examples = [
    'Chkoun 3amel login lyoum ?',
    '9adeh 3ana men transporteur actif ?',
    '9adeh men wa7ed fasa5 l\'application had el jem3a ?',
    'Combien de commandes cette semaine, et combien livrées ?',
    'Chkoun el chauffeurs online taw ?',
    'Quel est le total des commissions ce mois-ci ?',
  ];

  constructor(private hub: AdminHubService) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
      if (Array.isArray(saved)) this.messages = saved.slice(-30).map((m: ChatMessage) => ({ ...m, html: render(m.text) }));
    } catch { /* private window / blocked storage: start empty */ }
    this.stick = true;
  }

  ngAfterViewChecked(): void {
    if (!this.stick || !this.scroller) return;
    this.scroller.nativeElement.scrollTop = this.scroller.nativeElement.scrollHeight;
    this.stick = false;
  }

  async send(text = this.draft): Promise<void> {
    const question = text.trim();
    if (!question || this.busy) return;
    const history: AssistantTurn[] = this.messages.filter(m => !m.error).slice(-12).map(m => ({ role: m.role, text: m.text }));
    this.messages.push({ role: 'user', text: question, html: render(question) });
    this.draft = '';
    this.busy = true;
    this.stick = true;
    try {
      const res = await this.hub.askAssistant(question, history);
      this.messages.push({ role: 'model', text: res.answer, html: render(res.answer), steps: res.steps });
    } catch (e: any) {
      // A callable that isn't deployed (or crashed outside its try) only says "internal".
      const msg = e?.code === 'functions/internal' || e?.message === 'internal'
        ? 'Assistant unreachable: the adminAssistant function is not deployed, or it crashed (check its logs).'
        : e?.message || 'L\'assistant n\'a pas pu répondre.';
      this.messages.push({ role: 'model', text: msg, html: render(msg), error: true });
    } finally {
      this.busy = false;
      this.stick = true;
      this.persist();
    }
  }

  onKey(e: KeyboardEvent): void {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      this.send();
    }
  }

  /** Clicking a uid inside an answer opens Account 360. */
  onAnswerClick(e: MouseEvent): void {
    const uid = (e.target as HTMLElement)?.closest?.('.ai-uid')?.textContent?.trim();
    if (uid) this.openAccount.emit(uid);
  }

  clear(): void {
    this.messages = [];
    this.persist();
  }

  stepLabel(s: AssistantStep): string {
    const a = s.args || {};
    const where = (a.filters || []).map((f: any) => `${f.field} ${f.op} ${f.value}`).join(' & ');
    const target = a.collection || a.metric || '';
    return [s.tool, target, where && `(${where})`, a.groupBy && `by ${a.groupBy}`, a.from && `from ${a.from}`].filter(Boolean).join(' ');
  }

  private persist(): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.messages.slice(-30).map(({ html, showSteps, ...m }) => m)));
    } catch { /* storage unavailable */ }
  }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    // Firebase uids (28 chars) become links to Account 360.
    .replace(/\b([A-Za-z0-9]{28})\b/g, '<a class="hub-link ai-uid">$1</a>');
}

/** Small Markdown subset (headings, lists, tables, bold): everything escaped first. */
export function render(md: string): string {
  const lines = String(md || '').replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|?[\s:-]+\|/.test(lines[i + 1])) {
      const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
      const head = cells(line);
      i += 2;
      const body: string[][] = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(cells(lines[i++]));
      out.push(`<div class="hub-table-wrap"><table class="hub-table"><thead><tr>${head.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    if (/^\s*([-*•]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*•]|\d+\.)\s+/.test(lines[i])) items.push(`<li>${inline(lines[i++].replace(/^\s*([-*•]|\d+\.)\s+/, ''))}</li>`);
      out.push(ordered ? `<ol>${items.join('')}</ol>` : `<ul>${items.join('')}</ul>`);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) out.push(`<h6>${inline(h[2])}</h6>`);
    else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    i++;
  }
  return out.join('');
}
