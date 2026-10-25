import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { KitchenService, Dish } from '../../core/services/kitchen.service';
import { STYLES, errMsg } from './shared';

@Component({
  selector: 'app-kitchen-plan', standalone: true, imports: [CommonModule, FormsModule], styles: [STYLES],
  template: `
  @if (msg) { <div class="msg" [class.err]="isErr">{{ msg }}</div> }
  <div class="card"><h3>Log today’s cooking</h3>
    <div class="grid"><div><label for="md">Dish</label><select id="md" [(ngModel)]="log.dishId">@for (d of dishes; track d._id) { <option [value]="d._id">{{ d.name }}</option> }</select></div>
    <div><label for="mk">Cooked (kg)</label><input id="mk" type="number" step="0.1" [(ngModel)]="log.cookedKg"></div>
    <div><label for="mh">Headcount</label><input id="mh" type="number" [(ngModel)]="log.headcount"></div></div>
    <div style="margin-top:10px"><button (click)="saveLog()">Save</button></div></div>
  <h2>Tomorrow’s cooking plan</h2><p class="sub">Blend of the 7-day average and same-weekday consumption, plus an 8% buffer. Accuracy is backtested on the last 7 days.</p>
  @for (f of forecasts; track f.dishId) {
    <div class="card">
      @if (!f.ok) { <b>{{ f.name }}</b><div class="note">{{ f.error }}</div> } @else {
        <div class="row sp"><h3>{{ f.name }}</h3><span class="tag ok">Save {{ f.expectedReductionKg }} kg</span></div>
        <div class="grid"><div><span class="note">Cooked yesterday</span><div class="big">{{ f.prevCookedKg | number:'1.0-0' }} kg</div></div><div><span class="note">Cook tomorrow</span><div class="big g">{{ f.recKg | number:'1.0-0' }} kg</div></div></div>
        <p class="note">Likely range {{ f.lower | number:'1.0-0' }} to {{ f.upper | number:'1.0-0' }} kg. Error {{ f.mape }}% vs {{ f.naiveMape }}% for last week’s same day.</p>
        <div class="row"><button (click)="decide(f,'accept')">Accept</button><button class="alt" (click)="decide(f,'reject')">Reject</button></div>
      }
    </div>}`
})
export class PlanComponent implements OnInit {
  dishes: Dish[] = []; forecasts: any[] = []; msg = ''; isErr = false; log: any = {};
  constructor(private k: KitchenService) {}
  ngOnInit() { this.k.dishes().subscribe(r => { this.dishes = r.dishes; this.log.dishId = r.dishes[0]?._id; }); this.load(); }
  load() { this.k.forecast().subscribe(r => (this.forecasts = r.forecasts)); }
  saveLog() { this.k.saveMenu({ dishId: this.log.dishId, cookedKg: +this.log.cookedKg, ...(this.log.headcount ? { headcount: +this.log.headcount } : {}) }).subscribe({ next: () => { this.isErr = false; this.msg = 'Saved. Forecasts use it from tomorrow.'; this.load(); }, error: e => { this.isErr = true; this.msg = errMsg(e); } }); }
  decide(f: any, decision: string) { this.k.decide({ dishId: f.dishId, decision }).subscribe({ next: () => { this.isErr = false; this.msg = 'Decision logged.'; }, error: e => { this.isErr = true; this.msg = errMsg(e); } }); }
}
