from fastapi import FastAPI, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import sessionmaker, declarative_base, Session
from passlib.context import CryptContext
from jose import jwt
from datetime import datetime, timedelta
import stripe
import os

# =========================
# CONFIG
# =========================
SECRET_KEY = "supersecret"
ALGORITHM = "HS256"

stripe.api_key = "YOUR_STRIPE_SECRET"

DATABASE_URL = "sqlite:///./test.db"

# =========================
# DB SETUP
# =========================
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True)
    email = Column(String, unique=True)
    password = Column(String)

Base.metadata.create_all(bind=engine)

# =========================
# AUTH
# =========================
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

def hash_password(p): return pwd_context.hash(p)
def verify_password(p, h): return pwd_context.verify(p, h)

def create_token(data, minutes=30):
    data["exp"] = datetime.utcnow() + timedelta(minutes=minutes)
    return jwt.encode(data, SECRET_KEY, algorithm=ALGORITHM)

def get_user(creds: HTTPAuthorizationCredentials = Depends(security)):
    try:
        return jwt.decode(creds.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except:
        raise HTTPException(401, "Invalid token")

# =========================
# FASTAPI
# =========================
app = FastAPI()

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()

# =========================
# AUTH ROUTES
# =========================
@app.post("/signup")
def signup(email: str, password: str, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(400, "User exists")
    user = User(email=email, password=hash_password(password))
    db.add(user)
    db.commit()
    return {"msg": "created"}

@app.post("/login")
def login(email: str, password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password):
        raise HTTPException(401, "Invalid")
    return {"access_token": create_token({"user_id": user.id})}

# =========================
# VIDEO (PLACEHOLDER)
# =========================
@app.post("/create-video")
def create_video(topic: str, user=Depends(get_user)):
    return {"msg": f"Video created for {topic}"}

# =========================
# STRIPE SUBSCRIPTION
# =========================
@app.post("/subscribe")
def subscribe(plan: str):
    price_id = "price_basic" if plan == "basic" else "price_pro"

    session = stripe.checkout.Session.create(
        payment_method_types=["card"],
        mode="subscription",
        line_items=[{"price": price_id, "quantity": 1}],
        success_url="http://localhost:8000/success",
        cancel_url="http://localhost:8000/cancel",
    )

    return {"url": session.url}

# =========================
# ROOT
# =========================
@app.get("/")
def root():
    return {"status": "AutoVid AI running"}
