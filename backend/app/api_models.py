"""Stable request and response models for the stage 6 backend boundary."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


AttractionCategory = Literal[
    "museum_venue",
    "historic_site",
    "religious_architecture",
    "garden_park",
    "natural_scenery",
    "urban_district",
    "modern_landmark",
    "themed_experience",
]
AttractionTag = Literal[
    "history",
    "museum",
    "architecture",
    "religion",
    "red_culture",
    "nature",
    "garden",
    "urban_walk",
    "modern_city",
    "night_view",
    "art",
    "folk_custom",
    "family",
    "food",
    "photography",
    "leisure_walk",
]
ReservationRule = Literal["yes", "no", "conditional", "unknown"]
PoiCategory = Literal["all", "attraction", "hotel", "restaurant", "transport"]
TravelMode = Literal["public_transit", "taxi", "self_drive", "walk"]
DuckContentType = Literal["origin_story", "classic_recipe", "food_intro"]
DuckType = Literal["salted_duck", "duck_blood_soup", "roast_duck", "pressed_duck", "nanjing_cuisine"]
DiningDensityLevel = Literal["unsuitable", "normal", "rich", "cluster"]


class ErrorDetail(BaseModel):
    field: str | None = None
    message: str


class ErrorBody(BaseModel):
    code: str
    message: str
    retryable: bool = False
    details: list[ErrorDetail] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    error: ErrorBody


class HealthResponse(BaseModel):
    status: Literal["ok"]
    service: str
    version: str


class MapConfigResponse(BaseModel):
    enabled: bool
    js_key: str | None
    security_proxy_url: str | None
    message: str


class AttractionListResponse(BaseModel):
    items: list[dict[str, Any]]
    total: int
    returned_count: int
    offset: int
    limit: int
    is_mock: bool


class Coordinate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    longitude: float = Field(ge=118.0, le=119.3)
    latitude: float = Field(ge=31.2, le=32.7)
    coord_system: Literal["GCJ-02"] = "GCJ-02"


class TravelTimeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    origin: Coordinate
    destination: Coordinate
    mode: TravelMode

    @model_validator(mode="after")
    def locations_must_differ(self) -> "TravelTimeRequest":
        if self.origin.longitude == self.destination.longitude and self.origin.latitude == self.destination.latitude:
            raise ValueError("起点和终点不能相同")
        return self


class DuckContentSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    citation_id: str = Field(pattern=r"^T\d-\d{2}$")
    title: str
    url: str
    verified_at: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")


class DuckContentListItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9_]+$")
    content_type: DuckContentType
    duck_type: DuckType
    title: str
    summary: str
    sources: list[DuckContentSource]
    is_mock: bool


class DuckContentListResponse(BaseModel):
    items: list[DuckContentListItem]
    total: int
    returned_count: int
    is_mock: bool


class DuckContentDetailResponse(DuckContentListItem):
    detail: str | None = None


class PoiLocation(BaseModel):
    longitude: float
    latitude: float
    coord_system: Literal["GCJ-02"]


class PoiItem(BaseModel):
    poi_id: str
    name: str
    type: str
    typecode: str
    address: str
    district: str
    location: PoiLocation
    rating: float | None
    average_cost_yuan: float | None
    telephone: str | None
    source: Literal["amap"]


class PoiSearchResponse(BaseModel):
    keyword: str
    category: PoiCategory
    query_mode: Literal["text", "around"]
    page_num: int
    page_size: int
    returned_count: int
    has_more: bool
    pois: list[PoiItem]
    source: Literal["amap"]


class RestaurantPoi(BaseModel):
    """Project-owned restaurant fields returned by dining-specific APIs."""

    model_config = ConfigDict(extra="forbid")

    poi_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    address: str | None
    location: Coordinate
    category: str | None
    distance_m: int | None = Field(default=None, ge=0)
    rating: float | None = Field(default=None, ge=0, le=5)
    average_cost: float | None = Field(default=None, ge=0)
    telephone: str | None
    duck_types: list[DuckType] = Field(default_factory=list)
    source: Literal["amap"]
    fetched_at: datetime


class RestaurantSearchResponse(BaseModel):
    """A bounded page of restaurants around one dining-area center."""

    model_config = ConfigDict(extra="forbid")

    center: Coordinate
    radius_meters: int = Field(ge=100, le=3000)
    page_num: int = Field(ge=1, le=100)
    page_size: int = Field(ge=1, le=25)
    returned_count: int = Field(ge=0)
    has_more: bool
    restaurants: list[RestaurantPoi]
    source: Literal["amap"]
    note: str


class MetroStationSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^metro_station_.+")
    name: str = Field(min_length=1)
    location: Coordinate
    line_ids: list[str] = Field(min_length=1)
    is_major: bool
    major_reasons: list[
        Literal["interchange", "gateway", "near_formal_attraction", "owner_confirmed"]
    ]
    nearby_attraction_ids: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def nearby_attractions_use_formal_ids(self) -> "MetroStationSummary":
        for attraction_id in self.nearby_attraction_ids:
            if not re.fullmatch(r"attr_[0-9]{3}", attraction_id):
                raise ValueError(f"nearby_attraction_ids 含非正式景点编号：{attraction_id}")
        return self


class MetroLineSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^metro_line_[a-z0-9_]+$")
    name: str = Field(min_length=1)
    short_name: str = Field(min_length=1)
    color: str = Field(pattern=r"^#[0-9A-F]{6}$")
    path: list[list[float]] = Field(min_length=2)
    station_ids: list[str] = Field(min_length=2)
    provider_ids: list[str] = Field(min_length=1)


class MetroSource(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1)
    url: str = Field(min_length=1)
    verified_at: str = Field(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
    note: str = Field(min_length=1)


class MetroNetworkResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    data_version: Literal["metro-network-v1"]
    verified_at: str = Field(pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")
    coord_system: Literal["GCJ-02"]
    scope_note: str = Field(min_length=1)
    sources: list[MetroSource] = Field(min_length=1)
    lines: list[MetroLineSummary] = Field(min_length=1)
    stations: list[MetroStationSummary] = Field(min_length=1)


class DuckRestaurantPoi(RestaurantPoi):
    """Restaurant with at least one F4-controlled duck classification."""

    duck_types: list[DuckType] = Field(min_length=1)

    @model_validator(mode="after")
    def duck_types_must_be_unique(self) -> "DuckRestaurantPoi":
        if len(self.duck_types) != len(set(self.duck_types)):
            raise ValueError("duck_types 不能包含重复值")
        return self


class DuckRestaurantSearchResponse(BaseModel):
    """Bounded multi-keyword search result for the dedicated duck route."""

    model_config = ConfigDict(extra="forbid")

    query_mode: Literal["text", "around"]
    center: Coordinate | None
    radius_meters: int | None = Field(default=None, ge=100, le=3000)
    returned_count: int = Field(ge=0, le=50)
    restaurants: list[DuckRestaurantPoi] = Field(max_length=50)
    queries_attempted: int = Field(ge=1, le=12)
    queries_succeeded: int = Field(ge=1, le=12)
    failed_query_count: int = Field(ge=0, le=12)
    is_partial: bool
    is_capped: bool
    source: Literal["amap"]
    note: str = Field(min_length=1)

    @model_validator(mode="after")
    def metadata_must_be_consistent(self) -> "DuckRestaurantSearchResponse":
        if self.returned_count != len(self.restaurants):
            raise ValueError("returned_count 必须等于 restaurants 数量")
        if self.queries_attempted != self.queries_succeeded + self.failed_query_count:
            raise ValueError("检索请求计数不一致")
        if self.is_partial != (self.failed_query_count > 0):
            raise ValueError("is_partial 必须与失败请求数一致")
        if self.query_mode == "text":
            if self.center is not None or self.radius_meters is not None:
                raise ValueError("text 模式不能返回中心点或半径")
        elif self.center is None or self.radius_meters is None:
            raise ValueError("around 模式必须返回中心点和半径")
        return self


HotelPriceBand = Literal[
    "under_200", "200_300", "300_400", "400_500", "over_500", "unknown"
]


class HotelPoi(BaseModel):
    """Project-owned hotel fields returned by the on-demand hotel API."""

    model_config = ConfigDict(extra="forbid")

    poi_id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    address: str | None
    location: Coordinate
    nearest_metro: str | None
    rating: float | None = Field(default=None, ge=0, le=5)
    price_band: HotelPriceBand
    source: Literal["amap"]
    fetched_at: datetime


class HotelSearchResponse(BaseModel):
    """A bounded page of hotels around one on-demand query center."""

    model_config = ConfigDict(extra="forbid")

    center: Coordinate
    radius_meters: int = Field(ge=100, le=3000)
    page_num: int = Field(ge=1, le=10)
    page_size: int = Field(ge=1, le=25)
    returned_count: int = Field(ge=0)
    has_more: bool
    hotels: list[HotelPoi]
    source: Literal["amap"]
    note: str


class DiningArea(BaseModel):
    """A bounded restaurant sample around one reusable candidate center."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(pattern=r"^[a-z0-9_]+$")
    name: str = Field(min_length=1)
    center: Coordinate
    radius_meters: int = Field(ge=100, le=3000)
    evaluated_radii_meters: list[int]
    restaurant_count: int = Field(ge=0)
    density_level: DiningDensityLevel
    density_label: str
    has_suitable_area: bool
    near_item_id: str | None = None
    restaurant_preview: list[RestaurantPoi]
    pages_queried: int = Field(ge=1)
    is_capped: bool
    message: str
    source: Literal["amap"]
    note: str


class DiningDensityResponse(BaseModel):
    center: PoiLocation
    radius_m: int
    sampled_count: int
    density_level: Literal["low", "medium", "high"]
    density_label: str
    pages_queried: int
    is_capped: bool
    sample_pois: list[PoiItem]
    source: Literal["amap"]
    note: str


class TransitRideSegment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["metro", "bus", "taxi", "railway"]
    line_name: str | None
    departure_stop: str | None
    arrival_stop: str | None
    duration_minutes: int | None = Field(ge=0)


class TransitTransfer(BaseModel):
    model_config = ConfigDict(extra="forbid")

    from_line_name: str | None
    to_line_name: str | None
    arrival_stop: str | None
    departure_stop: str | None


class TransitRouteSegment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["walk", "metro", "bus", "taxi", "railway"]
    line_name: str | None
    path: list[tuple[float, float]]


class TransitRouteDetails(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_minutes: int = Field(gt=0)
    conservative_minutes: int = Field(ge=30, multiple_of=30)
    walking_distance_m: int | None = Field(ge=0)
    walking_minutes: int | None = Field(ge=0)
    transfer_count: int = Field(ge=0)
    ride_segments: list[TransitRideSegment]
    route_segments: list[TransitRouteSegment]
    transfers: list[TransitTransfer]
    summary: str


class DrivingRouteSegment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["taxi", "self_drive"]
    line_name: str | None
    path: list[tuple[float, float]]


class DrivingRouteDetails(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_minutes: int = Field(gt=0)
    route_segments: list[DrivingRouteSegment]
    summary: str


class TravelTimeResponse(BaseModel):
    mode: TravelMode
    path_details: dict[str, Any] | None = None
    raw_minutes: int
    buffer_minutes: int
    estimated_minutes: int
    display: str
    distance_m: int
    source: Literal["amap"]
    note: str
    transit_details: TransitRouteDetails | None = None
    driving_details: DrivingRouteDetails | None = None


class WeatherForecastDay(BaseModel):
    """One forecast day; missing upstream fields stay null, never invented."""

    model_config = ConfigDict(extra="forbid")

    date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    day_weather: str | None
    night_weather: str | None
    day_temp: int | None = Field(default=None, ge=-100, le=100)
    night_temp: int | None = Field(default=None, ge=-100, le=100)
    day_wind: str | None
    night_wind: str | None
    day_wind_power: str | None
    night_wind_power: str | None


class WeatherResponse(BaseModel):
    """Nanjing QWeather forecast, display-only; retrieval is not publication."""

    model_config = ConfigDict(extra="forbid")

    city: str
    adcode: str
    report_time: str | None
    retrieved_time: str
    forecast_days: list[WeatherForecastDay] = Field(min_length=1)
    source: Literal["qweather"]
    note: str
