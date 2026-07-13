// Compatibility shim. The canonical module now lives in the Supabase
// uploadable function tree so the Edge Function can import it natively:
//   supabase/functions/_shared/aiGatewayInput.js
// This re-export preserves the existing src/lib import path. No logic here.
export * from '../../supabase/functions/_shared/aiGatewayInput.js';
