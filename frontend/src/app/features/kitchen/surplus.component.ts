import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KitchenService, Dish } from '../../core/services/kitchen.service';
import { STYLES, errMsg } from './shared';

@Component({
  selector: 'app-kitchen-surplus', standalone: true, imports: [CommonModule, FormsModule], styles: [STYLES],
  template: `
  <h2>Offer surplus</h2><p class="sub">The safety clock decides which NGOs can still be offered the food. This tool supports, and does not replace, food-safety judgement.</p>
  @if (msg) { <div class="msg" [class.err]="isErr">{{ msg }}</div> }
  <div class="card"><div class="grid">
    <div><label for="d">Dish</label><select id="d" [(ngModel)]="f.dishId">@for (d of dishes; track d._id) { <option [value]="d._id">{{ d.name }}</option> }</select></div>
    <div><label for="k">Quantity (kg)</label><input id="k" type="number" [(ngModel)]="f.kg"></div>
    <div><label for="s">Storage</label><select id="s" [(ngModel)]="f.storage"><option value="hot">Hot-held above 60 °C</option><option value="chill">Chilled below 5 °C</option><option value="amb">Room temperature</option></select></div>
    <div><label for="a">Prepared (hours ago)</label><input id="a" type="number" step="0.5" [(ngModel)]="f.hoursAgo"></div>
    <div><label for="v">Diet</label><select id="v" [(ngModel)]="f.diet"><option>veg</option><option>non-veg</option></select></div>
    <div><label for="al">Allergens</label><input id="al" [(ngModel)]="f.allergens"></div>
    <div style="grid-column:1/3"><label for="p">Pickup location</label><input id="p" [(ngModel)]="f.pickupLocation"></div>
    <div><label for="la">Latitude</label><input id="la" type="number" step="any" [(ngModel)]="f.lat"></div>
    <div><label for="ln">Longitude</label><input id="ln" type="number" step="any" [(ngModel)]="f.lng"></div></div>
    <label><input type="checkbox" style="width:auto" [(ngModel)]="c.covered"> Covered</label>
    <label><input type="checkbox" style="width:auto" [(ngModel)]="c.temperature"> Temperature logged</label>
    <label><input type="checkbox" style="width:auto" [(ngModel)]="c.allergens"> Allergens noted</label>
    <div style="margin-top:10px"><button (click)="submit()">Start safety clock</button></div></div>
  @if (res) {
    <div class="card"><div class="row sp"><h3>{{ res.food.title }}, {{ res.food.quantity }} kg</h3><span class="tag" [class.bad]="res.urgency==='high'" [class.low]="res.urgency==='medium'" [class.ok]="res.urgency==='low'">{{ res.urgency }} urgency</span></div>
      <div class="big" [class.g]="mins>120" [class.a]="mins<=120&&mins>45" [class.r]="mins<=45">{{ clock }} <span class="note">safe time left</span></div>
      <h4>Best matches</h4>
      @for (n of res.recommendedNGOs; track n.ngoId) { <div class="note"><b>{{ n.name }}</b>: {{ n.distance }} km, pickup in about {{ n.etaMin }} min</div> }
      @if (!res.recommendedNGOs.length) { <div class="note">No NGO can safely receive this in time.</div> }
      @for (n of res.notEligible; track n.name) { <div class="note" style="opacity:.6">{{ n.name }}: {{ n.reason }}</div> }
    </div>}`
})
export class SurplusComponent implements OnInit, OnDestroy {
  dishes: Dish[] = []; res: any = null; msg = ''; isErr = false; mins = 0; clock = ''; private t: any;
  f: any = { kg: 8, storage: 'hot', hoursAgo: 1, diet: 'veg', allergens: '' };
  c = { covered: false, temperature: false, allergens: false };
  constructor(private k: KitchenService) {}
  ngOnInit() { this.k.dishes().subscribe(r => { this.dishes = r.dishes; this.f.dishId = r.dishes[0]?._id; }); this.t = setInterval(() => this.tick(), 1000); }
  ngOnDestroy() { clearInterval(this.t); }
  tick() { if (!this.res) return; const ms = new Date(this.res.food.expirationDate).getTime() - Date.now(); this.mins = Math.floor(ms / 60000);
    this.clock = ms <= 0 ? 'Expired' : `${Math.floor(this.mins / 60)}h ${String(this.mins % 60).padStart(2, '0')}m ${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}s`; }
  submit() {
    this.k.surplus({ ...this.f, checklist: this.c }).subscribe({
      next: r => { this.res = r; this.isErr = false; this.msg = 'Listed. NGOs that can reach it in time are ranked below.'; this.tick(); },
      error: e => { this.isErr = true; this.msg = errMsg(e); }
    });
  }
}
