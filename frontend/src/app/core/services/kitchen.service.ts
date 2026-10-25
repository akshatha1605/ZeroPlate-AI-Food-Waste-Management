import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface Dish { _id: string; name: string; costPerKg: number; co2ePerKg: number; hotHours: number; chillHours: number; ambHours: number; portionG: number }
export interface WasteItem { dishId: string; grams: number; category: string; confidence: number; needsReview?: boolean }

@Injectable({ providedIn: 'root' })
export class KitchenService {
  private api = `${environment.apiUrl}/kitchen`;
  constructor(private http: HttpClient) {}

  dishes() { return this.http.get<{ dishes: Dish[] }>(`${this.api}/dishes`); }
  addDish(d: Partial<Dish>) { return this.http.post(`${this.api}/dishes`, d); }
  deleteDish(id: string) { return this.http.delete(`${this.api}/dishes/${id}`); }
  demoSeed() { return this.http.post(`${this.api}/demo-seed`, {}); }
  saveMenu(b: { dishId: string; cookedKg: number; headcount?: number }) { return this.http.post(`${this.api}/menu`, b); }
  analyze(image: string, mime: string) { return this.http.post<{ model: string; provider: string; mock: boolean; warning?: string; items: WasteItem[] }>(`${this.api}/waste/analyze`, { image, mime }); }
  saveWaste(items: WasteItem[], model: string) { return this.http.post<{ saved: number }>(`${this.api}/waste`, { items, model }); }
  fingerprint(dishId: string) { return this.http.get<any>(`${this.api}/waste/fingerprint/${dishId}`); }
  forecast() { return this.http.get<{ forecasts: any[] }>(`${this.api}/forecast`); }
  decide(b: { dishId: string; decision: string; finalKg?: number }) { return this.http.post(`${this.api}/forecast/decision`, b); }
  surplus(b: any) { return this.http.post<any>(`${this.api}/surplus`, b); }
  impact(days: number) { return this.http.get<any>(`${this.api}/impact`, { params: { days } }); }
  simulate(b: { dishId: string; pct: number; weekday?: number }) { return this.http.post<any>(`${this.api}/simulate`, b); }
}
