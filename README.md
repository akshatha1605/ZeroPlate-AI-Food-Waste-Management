# ZeroPlate — AI-Powered Food Waste Intelligence System

**Turn food waste into smarter decisions.**

ZeroPlate is an AI-powered food waste management system designed to help canteens, hostel messes, and restaurants reduce food waste through intelligent waste estimation, demand forecasting, and surplus food redistribution.

The system aims to transform everyday food waste data into actionable recommendations, helping kitchens prepare the right quantity of food, connect surplus meals with NGOs, and redirect inedible waste towards sustainable disposal methods.

## Problem Statement

Food waste is a major sustainability challenge. Institutional kitchens and restaurants often struggle to predict daily food demand, measure leftover food accurately, and redistribute surplus meals before they become unsafe for consumption.

The lack of a unified, data-driven system leads to unnecessary food waste, financial losses, and missed opportunities to support people in need.

## Proposed Solution

ZeroPlate provides a unified platform that combines AI-assisted food waste estimation, demand forecasting, food-safety monitoring, and surplus food donation management.

The system is designed to help kitchen managers make informed decisions, reduce overproduction, and ensure that usable surplus food reaches suitable donation partners in time.

## Key Features

- **AI-Based Waste Estimation:** Estimate leftover food quantities from uploaded images, with options for manual correction.
- **Demand Forecasting:** Recommend the quantity of food to prepare based on historical consumption and waste data.
- **Food-Safety Countdown:** Track surplus food batches and prevent expired batches from being offered for donation.
- **Smart NGO Matching:** Match available surplus food with suitable NGOs and coordinate collection.
- **Pickup Route and ETA:** Display collection routes and estimated arrival times.
- **Impact Dashboard:** Track food waste, estimated cost savings, donations, and environmental impact.
- **What-If Simulator:** Explore how changes in food preparation quantities could affect waste and savings.
- **Waste Diversion:** Support directing inedible food waste towards appropriate composting or biogas options.

## Target Users

- Kitchen Managers
- Kitchen Staff
- NGO Coordinators
- Volunteers and Delivery Personnel
- Sustainability Officers
- System Administrators

## Technology Stack

The final technology stack will be selected based on implementation requirements and hackathon constraints.

| Component | Planned Technology / Approach |
|---|---|
| Frontend | React |
| Backend | Python with FastAPI |
| Database | PostgreSQL / Supabase |
| AI Waste Estimation | Vision model or vision API |
| Demand Forecasting | Python-based forecasting |
| Maps and Routing | Maps or routing API |
| Version Control | Git and GitHub |

*The technologies listed above represent the initial plan and may be updated to reflect the final implementation.*

## Project Workflow

1. Record leftover food using an image or manual input.
2. Estimate and save the quantity of food waste.
3. Use historical data to recommend the next day's cooking quantities.
4. Register surplus food batches and monitor their safety deadlines.
5. Match eligible surplus food with NGOs and coordinate collection.
6. Display waste-reduction statistics and estimated sustainability impact.

## Innovation and Unique Value Proposition

- **Dish-Level Waste Tracking:** Identify recurring waste patterns for individual dishes.
- **Safety-Aware Redistribution:** Combine surplus-food tracking with time-sensitive donation eligibility.
- **Data-Driven Cooking Decisions:** Use past consumption and waste data to reduce overproduction.
- **Measurable Sustainability Impact:** Present estimated waste, cost, and environmental savings in one dashboard.

## Current Development Status

**Stage:** Initial MVP development

The project is being developed as a hackathon prototype. Features will be implemented and tested incrementally. AI-generated estimates and simulated data, where used, will be identified appropriately.

## Future Scope

- Integration with IoT-based weighing devices.
- Improved forecasting using larger historical datasets.
- Integration with additional food donation partners.
- Enhanced waste analytics and sustainability reporting.
- Expansion to multiple kitchens and institutional locations.

## Getting Started

Setup instructions will be added once the initial application structure and dependencies are finalized.

## Team

Developed by a team of five as part of a sustainability and food waste reduction hackathon.

## License

The project license will be specified in the repository once finalized.
