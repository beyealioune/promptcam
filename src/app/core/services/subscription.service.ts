import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Purchases, type PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  readonly isPremium = signal(false);
  readonly isReady = signal(false);
  readonly price = signal('9,99 €');
  private currentPackage: PurchasesPackage | null = null;

  async initialize(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      this.isReady.set(true);
      return;
    }

    const apiKey = Capacitor.getPlatform() === 'ios'
      ? environment.revenueCat.appleApiKey
      : environment.revenueCat.googleApiKey;

    if (apiKey.includes('REVENUECAT_PUBLIC')) {
      this.isReady.set(true);
      return;
    }

    await Purchases.configure({ apiKey });
    const [{ customerInfo }, offerings] = await Promise.all([
      Purchases.getCustomerInfo(),
      Purchases.getOfferings(),
    ]);
    this.applyCustomerInfo(customerInfo);
    // Try the named offering first, then fall back to the default current offering
    const targetOffering = offerings.all[environment.revenueCat.offeringId] ?? offerings.current;
    this.currentPackage =
      targetOffering?.monthly ??
      targetOffering?.availablePackages[0] ??
      null;
    const price = this.currentPackage?.product.priceString;
    if (price) this.price.set(price);
    await Purchases.addCustomerInfoUpdateListener((info) => this.applyCustomerInfo(info));
    this.isReady.set(true);
  }

  async purchasePremium(): Promise<boolean> {
    if (!this.currentPackage) throw new Error('OFFERING_NOT_CONFIGURED');
    const { customerInfo } = await Purchases.purchasePackage({ aPackage: this.currentPackage });
    this.applyCustomerInfo(customerInfo);
    return this.isPremium();
  }

  async restorePurchases(): Promise<boolean> {
    const { customerInfo } = await Purchases.restorePurchases();
    this.applyCustomerInfo(customerInfo);
    return this.isPremium();
  }

  private applyCustomerInfo(info: { entitlements: { active: Record<string, unknown> } }): void {
    this.isPremium.set(Boolean(info.entitlements.active[environment.revenueCat.entitlementId]));
  }
}
