export function changeableBillingPlans(plans = []) {
  return plans.filter((plan) => String(plan?.code || '').toLowerCase() !== 'trial');
}
