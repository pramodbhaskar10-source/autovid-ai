# AutoVid AI - Auth System Upgrade 🔐

# =====================================
# Adds:
# - Signup
# - Login
# - Password hashing (bcrypt)
# - JWT access + refresh tokens
# =====================================

# Install extras in requirements.txt
fastapi
uvicorn
sqlalchemy
psycopg2-binary
passlib[bcrypt]
python-jose
python-dotenv


# =====================================
# app/auth.py
# =====================================
from datetime import datetime, timedelta
from jose import jwt
from passlib.context import CryptContext

SECRET_KEY = "CHANGE_THIS_SECRET"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
REFRESH_TOKEN_EXPIRE_DAYS = 7

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(password, hashed)


def create_access_token(data: dict):
    to_encode = data.copy()
    to_encode.update({"exp": datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict):
    to_encode = data.copy()
    to_encode.update({"exp": datetime.utcnow() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


# =====================================
# app/models.py
# =====================================
from sqlalchemy import Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True, index=True)
    password = Column(String)


# =====================================
# app/database.py
# =====================================
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "postgresql://user:pass@db:5432/autovid"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# =====================================
# app/routes/user.py
# =====================================
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import User
from app.auth import hash_password, verify_password, create_access_token, create_refresh_token

router = APIRouter(prefix="/user")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/signup")
def signup(email: str, password: str, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")

    user = User(email=email, password=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"message": "User created"}


@router.post("/login")
def login(email: str, password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()

    if not user or not verify_password(password, user.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    access = create_access_token({"user_id": user.id})
    refresh = create_refresh_token({"user_id": user.id})

    return {
        "access_token": access,
        "refresh_token": refresh
    }


@router.post("/refresh")
def refresh_token(token: str):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        new_access = create_access_token({"user_id": user_id})
        return {"access_token": new_access}
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid refresh token")


# =====================================
# Protect Routes Example
# =====================================
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Security

security = HTTPBearer()


def get_current_user(creds: HTTPAuthorizationCredentials = Security(security)):
    token = creds.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")


# Example usage in video route:
# def create_video(user=Depends(get_current_user)):


# =====================================
# README ADDITION
# =====================================
# Auth Endpoints:
# POST /user/signup
# POST /user/login
# POST /user/refresh

# =====================================
# STRIPE SUBSCRIPTION SYSTEM 💳
# =====================================

# Add to requirements.txt
stripe


# =====================================
# app/routes/payment.py (UPDATED)
# =====================================
from fastapi import APIRouter, HTTPException
import stripe
import os

router = APIRouter(prefix="/payment")

stripe.api_key = os.getenv("STRIPE_SECRET_KEY")

# Example Price IDs (create in Stripe dashboard)
BASIC_PLAN = "price_basic_monthly"
PRO_PLAN = "price_pro_monthly"


@router.post("/create-checkout-session")
def create_checkout_session(plan: str):
    try:
        price_id = BASIC_PLAN if plan == "basic" else PRO_PLAN

        session = stripe.checkout.Session.create(
            payment_method_types=["card"],
            mode="subscription",
            line_items=[{
                "price": price_id,
                "quantity": 1,
            }],
            success_url="http://localhost:3000/dashboard?success=true",
            cancel_url="http://localhost:3000/dashboard?canceled=true",
        )

        return {"url": session.url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# =====================================
# WEBHOOK (IMPORTANT)
# =====================================

from fastapi import Request

WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET")

@router.post("/webhook")
async def stripe_webhook(request: Request):
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, WEBHOOK_SECRET
        )
    except Exception:
        raise HTTPException(status_code=400, detail="Webhook error")

    if event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        # TODO: Save subscription in DB

    if event["type"] == "invoice.payment_failed":
        # TODO: Handle failed payment
        pass

    return {"status": "success"}


# =====================================
# DATABASE UPDATE (models.py)
# =====================================
from sqlalchemy import Column, Integer, String

class Subscription(Base):
    __tablename__ = "subscriptions"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer)
    stripe_customer_id = Column(String)
    stripe_subscription_id = Column(String)
    plan = Column(String)
    status = Column(String)


# =====================================
# FRONTEND (Next.js Example)
# =====================================

# pages/dashboard.js (UPDATE)
const subscribe = async (plan) => {
  const res = await fetch('http://localhost:8000/payment/create-checkout-session?plan=' + plan, {
    method: 'POST'
  })
  const data = await res.json()
  window.location.href = data.url
}

// UI Buttons:
// <button onClick={() => subscribe('basic')}>Basic Plan</button>
// <button onClick={() => subscribe('pro')}>Pro Plan</button>


# =====================================
# STRIPE SETUP STEPS
# =====================================
# 1. Go to Stripe Dashboard
# 2. Create Products → Add monthly pricing
# 3. Copy Price IDs → replace above
# 4. Add webhook endpoint:
#    http://yourdomain.com/payment/webhook
# 5. Get webhook secret → add to .env


# =====================================
# ENV VARIABLES (.env)
# =====================================
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...


# =====================================
# README ADDITION
# =====================================
# Subscription Flow:
# 1. User clicks plan
# 2. Redirect to Stripe Checkout
# 3. Payment successful
# 4. Webhook updates DB
# 5. User gets access

# Plans:
# - Basic: Limited videos
# - Pro: Unlimited videos

# Next Improvements:
# - Add usage limits per plan
# - Add billing portal (Stripe Customer Portal)
# - Add upgrade/downgrade logic
