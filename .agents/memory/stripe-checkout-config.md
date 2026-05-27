---
name: Stripe checkout config
description: Key Stripe Checkout session options and gotchas for EstimatorX
---

# Stripe Checkout Configuration

## price_method_collection: "if_required"
Subscriptions (`mode: "subscription"`) must include `payment_method_collection: "if_required"` so Stripe skips the credit card form when a promo code reduces the total to $0.

**Why:** Stripe defaults to always collecting a card for subscriptions, even at $0. This option makes the card form conditional on whether payment is actually needed.

**How to apply:** Already set on the xplan checkout route. Apply to any future subscription checkout sessions too.

## Stripe secret key types
- `mk_...` = restricted key — rejected by Stripe for Checkout session creation
- `pk_...` = publishable key — wrong field, causes 401
- `sk_live_...` / `sk_test_...` = correct standard secret key

## Price ID vs Product ID
- `prod_...` = Product ID — wrong, causes "No such price" error
- `price_...` = Price ID — correct, found under the Pricing section of a product in Stripe Dashboard

## Mode matching
Secret key and price IDs must be from the same Stripe mode (both test or both live). Mixing causes `resource_missing` 400 errors.
