const express = require('express');
const crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

router.post('/razorpay-webhook', express.raw({type: 'application/json'}), async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const webhookSignature = req.headers['x-razorpay-signature'];
  
  const shasum = crypto.createHmac('sha256', webhookSecret);
  shasum.update(JSON.stringify(req.body));
  const digest = shasum.digest('hex');
  
  if (digest !== webhookSignature) {
    return res.status(400).json({ error: 'Invalid signature' });
  }
  
  const event = req.body;
  
  if (event.event === 'subscription.activated' || event.event === 'subscription.charged') {
    const sub = event.payload.subscription.entity;
    const customerEmail = sub.notes?.email || sub.email;
    
    if (!customerEmail) return res.status(200).json({ status: 'no email' });
    
    const user = await prisma.user.upsert({
      where: { email: customerEmail },
      update: { plan: 'pro', razorpayCustId: sub.customer_id, credits: 999999 },
      create: { email: customerEmail, plan: 'pro', razorpayCustId: sub.customer_id, credits: 999999 }
    });
    
    await prisma.subscription.upsert({
      where: { razorpaySubId: sub.id },
      update: { status: sub.status },
      create: {
        userId: user.id,
        razorpaySubId: sub.id,
        razorpayPlanId: sub.plan_id,
        status: sub.status
      }
    });
  }
  
  if (event.event === 'subscription.cancelled') {
    const sub = event.payload.subscription.entity;
    const customerEmail = sub.notes?.email || sub.email;
    
    await prisma.user.updateMany({
      where: { email: customerEmail },
      data: { plan: 'cancelled', credits: 3 }
    });
  }
  
  res.status(200).json({ status: 'ok' });
});

module.exports = router;