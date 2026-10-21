export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({error:'method_not_allowed'});
  return res.status(200).json({
    service:'central-homes-ai-engine',
    status:'ok',
    jobnimbus:'not_connected',
    measurement:'not_configured',
    permitting:'draft_only'
  });
}
