import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KitchenService, Dish, WasteItem } from '../../core/services/kitchen.service';
import { STYLES, errMsg, resizeToBase64 } from './shared';

@Component({
  selector: 'app-kitchen-measure', standalone: true, imports: [CommonModule, FormsModule], styles: [STYLES],
  template: `
  <h2>Measure waste</h2><p class="sub">Photograph food only, not people. Review the estimate, fix it, then save.</p>
  @if (msg) { <div class="msg" [class.err]="isErr">{{ msg }}</div> }
  <div class="card">
    <input type="file" accept="image/*" capture="environment" (change)="pick($event)" aria-label="Photo of leftovers">
    <div class="row" style="margin-top:10px"><button [disabled]="!image || busy" (click)="analyze()">{{ busy ? 'Analyzing…' : 'Analyze photo' }}</button><button class="alt" (click)="manual()">Enter manually</button></div>
  </div>
  @if (items.length) {
    <div class="card"><h3>Review estimate</h3>
      @for (it of items; track $index) {
        <div class="row" style="margin-top:8px">
          <div style="flex:2;min-width:140px"><label>Dish</label><select [(ngModel)]="it.dishId" (change)="it.confidence=100;it.needsReview=false">@for (d of dishes; track d._id) { <option [value]="d._id">{{ d.name }}</option> }</select></div>
          <div style="flex:1;min-width:90px"><label>Wasted (g)</label><input type="number" [(ngModel)]="it.grams" (change)="it.confidence=100;it.needsReview=false"></div>
          <div style="flex:1;min-width:120px"><label>Type</label><select [(ngModel)]="it.category"><option value="plate-waste">Plate waste</option><option value="edible-surplus">Edible surplus</option><option value="inedible">Inedible</option></select></div>
          <span class="tag" [class.low]="it.needsReview" [class.ok]="!it.needsReview">{{ it.needsReview ? 'Check this: ' : '' }}{{ it.confidence }}% sure</span>
        </div>}
      <div class="row" style="margin-top:12px"><button (click)="save()">Save to log</button><button class="alt" (click)="addRow()">Add dish</button></div>
      @if (mock) { <p class="note">Placeholder estimator in use. Set GROQ_API_KEY on the server for real photo analysis.</p> }
    </div>}`
})
export class MeasureComponent implements OnInit {
  dishes: Dish[] = []; items: WasteItem[] = []; image = ''; busy = false; mock = false; model = 'manual'; msg = ''; isErr = false;
  constructor(private k: KitchenService) {}
  ngOnInit() { this.k.dishes().subscribe(r => { this.dishes = r.dishes; if (!r.dishes.length) { this.msg = 'Add dishes first (Dishes page).'; } }); }
  async pick(e: Event) { const f = (e.target as HTMLInputElement).files?.[0]; if (f) this.image = await resizeToBase64(f); }
  analyze() {
    this.busy = true; this.msg = '';
    this.k.analyze(this.image, 'image/jpeg').subscribe({
      next: r => { this.items = r.items; this.model = r.model; this.mock = r.mock; this.busy = false; this.isErr = !!r.warning; if (r.warning) this.msg = r.warning + '. Showing a placeholder estimate instead.'; else if (!r.items.length) this.msg = 'No leftovers found. Enter manually.'; },
      error: e => { this.busy = false; this.isErr = true; this.msg = errMsg(e); }
    });
  }
  manual() { if (this.dishes[0]) this.items = [{ dishId: this.dishes[0]._id, grams: 150, category: 'plate-waste', confidence: 100 }]; }
  addRow() { if (this.dishes[0]) this.items.push({ dishId: this.dishes[0]._id, grams: 100, category: 'plate-waste', confidence: 100 }); }
  save() {
    this.k.saveWaste(this.items.map(({ dishId, grams, category, confidence }) => ({ dishId, grams: +grams, category, confidence })), this.model).subscribe({
      next: r => { this.msg = `Saved ${r.saved} record(s).`; this.isErr = false; this.items = []; this.image = ''; },
      error: e => { this.isErr = true; this.msg = errMsg(e); }
    });
  }
}
