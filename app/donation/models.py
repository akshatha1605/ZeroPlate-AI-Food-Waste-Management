from typing import Literal, Optional
from pydantic import BaseModel, Field

from .database import DEFAULT_KITCHEN_LAT, DEFAULT_KITCHEN_LNG, DEFAULT_KITCHEN_NAME


class BatchCreateInput(BaseModel):
    dish_name: str = Field(min_length=1, max_length=200)
    quantity_grams: float = Field(gt=0, le=1_000_000)
    servings: Optional[int] = Field(default=None, ge=1, le=50_000)
    dietary_type: Literal["veg", "non-veg", "vegan"] = Field(default="veg")
    storage_condition: Literal["hot", "chilled", "room_temp"] = Field(default="hot")
    allergen_info: str = Field(default="", max_length=500)
    notes: str = Field(default="", max_length=1000)
    kitchen_name: str = Field(default=DEFAULT_KITCHEN_NAME, max_length=200)
    kitchen_lat: float = Field(default=DEFAULT_KITCHEN_LAT, ge=-90, le=90)
    kitchen_lng: float = Field(default=DEFAULT_KITCHEN_LNG, ge=-180, le=180)
    prepared_at: Optional[str] = Field(
        default=None,
        description="ISO-8601 timestamp when food was prepared. Defaults to current UTC time.",
    )
    safe_hours: Optional[float] = Field(
        default=None,
        gt=0,
        le=72,
        description="Custom safety window in hours from prepared_at. If omitted, derived from storage_condition.",
    )
    expires_at: Optional[str] = Field(
        default=None,
        description="Explicit ISO-8601 expiry timestamp. Overrides safe_hours if provided.",
    )


class NGOCreateInput(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    contact_person: str = Field(default="", max_length=200)
    phone: str = Field(default="", max_length=50)
    address: str = Field(default="", max_length=300)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    min_quantity_grams: float = Field(default=500, ge=0, le=1_000_000)
    max_capacity_grams: float = Field(default=50000, gt=0, le=5_000_000)
    accepted_dietary: str = Field(default="veg,non-veg,vegan", max_length=100)
    accepts_chilled: bool = Field(default=True)
    avg_response_mins: int = Field(default=10, ge=1, le=180)


class AssignBatchInput(BaseModel):
    ngo_id: int = Field(ge=1)
    volunteer_name: str = Field(default="", max_length=200)
    volunteer_phone: str = Field(default="", max_length=50)
    notes: str = Field(default="", max_length=500)


class DonationStatusUpdateInput(BaseModel):
    status: Literal["ACCEPTED", "REJECTED", "PICKED_UP", "DELIVERED", "CANCELLED"]
    volunteer_name: Optional[str] = Field(default=None, max_length=200)
    volunteer_phone: Optional[str] = Field(default=None, max_length=50)
    status_notes: Optional[str] = Field(default=None, max_length=500)
