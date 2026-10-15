# Cloud migration removal manifest (private implementation notes)

2026-10-15; source baseline 3fe6ccf25a40358bdde68d26ec364e6fff81f6c9. No database data deletion or migrations executed.

| Path relative to intochat-cloud | Reason | Traced callers/dependencies | Data effect | Replacement |
| --- | --- | --- | --- | --- |
| src/TripRadar.Server.API/Controllers/TripVaultController.cs | Retire travel vault/history REST entry | MVC discovery; Web tripVault/trip history clients; no C# callers outside declaration | None; repositories/schema retained temporarily | Removed route, no cloud equivalent |
| src/TripRadar.Server.API/Controllers/ScheduledQueriesController.cs | Retire schedule creation REST entry | MVC discovery; Web scheduledRequests; no C# callers | None; existing schedules require authorized retirement | Removed route |
| src/TripRadar.Server.API/Controllers/ScheduledExecutionController.cs | Retire schedule execution REST entry | MVC discovery; bot API client and Web scheduledRequests; no C# callers | None | Removed route; legacy worker execution gated |
| src/TripRadar.Server.API/Controllers/SearchController.cs | Retire travel airport/location search REST entry | MVC discovery; Web travel clients; no C# callers | None; generic country/currency/language/timezone retained | Removed route |
| src/TripRadar.Server.API/Controllers/TelegramLinkController.cs | Asserted chat ID must not link login identity | MVC discovery; retired telegramBind frontend helper; no C# callers | None | Session-bound identity-links API |

Travel provider/App/domain removal remains a separate pending vertical-slice change. This manifest does not claim all travel source has been removed. Historical travel tables/seeds are not authorized for destructive contraction.

## Public runtime inventory (read-only)

- DigitalBrain.Platform/Identity/IdentityEndpoints.cs already has cookie account sessions, scoped brain selection, idempotent account brain creation, membership and grant/revoke APIs. Reuse identity/brain creation internals; do not create a second brain or membership database in the runtime.
- DigitalBrain.Framework/Http/BrainRoutes.cs and BrainAccessFilter.cs enforce brain scope through IBrainAccess and account/principal context. Reuse these checks for any eventual scoped cloud exchange.
- DigitalBrain.Framework/Platform/Identity/AuthOptions.cs explicitly selects Open or Secured posture. Hosted allocations must use Secured; never infer security from headers.
- DigitalBrain.Platform/Storage/BrainGrainStorage.cs uses BrainLogs with append/ETag state and signal records. Storage and restore coordination must respect this format; no direct cloud database writes.
- DigitalBrain.Platform/Compute/UsageGrain.cs already aggregates per-brain cost with daily retention and a recent ring. This is not by itself a durable deduplicated commercial ledger or admission reservation protocol.
- No verified versioned cloud allocation/suspend/export/backup/access-exchange management contract was found in the inspected endpoints. Do not invent an HTTP adapter and claim compatibility.
- Runtime CLAUDE.md requires: "Use LSP for C# and Dart definitions, references, implementations and callers before changing code; check diagnostics after edits. Do not substitute text search for semantic change mapping." No LSP tool is available in this session, so no runtime C# changes were made. This blocks public-boundary implementation, not the independent private account/auth work.

## Trip-vault/history frontend removal — 2026-10-15

Static import trace: removed routes already unreachable; only ProfileTrips/ProfileTripHistory consumed the feature/entity barrels. Removed their profile barrel exports and orphan route helper. Retained usage trip metadata and generated compatibility schema because backend consumers remain. The listed paths were clean in git before deletion. Tests listed here describe only the removed UI and were not executed. No data/schema deletion.

Exact removed source files:
- src/TripRadar.WebUI/src/features/tripVault/index.ts
- src/TripRadar.WebUI/src/features/tripVault/ui/index.ts
- src/TripRadar.WebUI/src/features/tripVault/ui/TripVaultCard.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/TripVaultCardSkeleton.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/TripVaultForm.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/TripVaultHowTo.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/TripVaultList.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/TripVaultSection.test.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/TripVaultSection.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/tripVaultUtils.ts
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/EventCard.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/FlightCard.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/GenericCard.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/GoogleSearchCard.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/HistoryItemCard.providers.test.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/HistoryItemCard.test.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/HistoryItemCard.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/HotelCard.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/index.ts
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/LocalPlacesCard.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/MapsCard.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/OpenTableCard.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/parseHistoryData.test.ts
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/parseHistoryData.ts
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/TripAdvisorCard.tsx
- src/TripRadar.WebUI/src/features/tripVault/ui/historyCards/YelpCard.tsx
- src/TripRadar.WebUI/src/entities/tripVault/index.ts
- src/TripRadar.WebUI/src/entities/tripVault/api/activity.test.ts
- src/TripRadar.WebUI/src/entities/tripVault/api/activity.ts
- src/TripRadar.WebUI/src/entities/tripVault/api/index.ts
- src/TripRadar.WebUI/src/entities/tripVault/api/tripVaultApi.ts
- src/TripRadar.WebUI/src/entities/tripVault/api/types.ts
- src/TripRadar.WebUI/src/entities/tripVault/api/useCreateTripVaultMutation.ts
- src/TripRadar.WebUI/src/entities/tripVault/api/useDeleteTripVaultMutation.ts
- src/TripRadar.WebUI/src/entities/tripVault/api/useRemoveTripItemMutation.ts
- src/TripRadar.WebUI/src/entities/tripVault/api/useTripQueryHistoryQuery.ts
- src/TripRadar.WebUI/src/entities/tripVault/api/useTripVaultsQuery.ts
- src/TripRadar.WebUI/src/entities/tripVault/api/useUpdateTripVaultMutation.ts
- src/TripRadar.WebUI/src/pages/profile/ui/tripHistory/HistoryFilterTabs.tsx
- src/TripRadar.WebUI/src/pages/profile/ui/tripHistory/HistoryList.tsx
- src/TripRadar.WebUI/src/pages/profile/ui/tripHistory/HistoryListSkeleton.tsx
- src/TripRadar.WebUI/src/pages/profile/ui/tripHistory/HistoryToolbar.tsx
- src/TripRadar.WebUI/src/pages/profile/ui/tripHistory/index.ts
- src/TripRadar.WebUI/src/pages/profile/ui/tripHistory/tripHistoryUtils.ts
- src/TripRadar.WebUI/src/pages/profile/ui/tripHistory/TripInfoCard.tsx
- src/TripRadar.WebUI/src/pages/profile/ui/ProfileTrips.tsx
- src/TripRadar.WebUI/src/pages/profile/ui/ProfileTripHistory.tsx

## Scheduled-travel frontend and orphan history expander — 2026-10-15

Only the retired ProfileScheduledRequests page/barrel and its exclusively travel feature consumed these entity hooks. Removed the dead router mock export. The history expander had no caller after controller removal; removed its DI registration, implementation and contract. Shared profile/usage types and backend travel dependencies remain pending further tracing. No data changes.

Exact removed source files:
- src/TripRadar.WebUI/src/features/scheduledRequests/index.ts
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/constants.ts
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/index.ts
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/ScheduledRequestsSection.test.tsx
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/ScheduledRequestsSection.tsx
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/utils.ts
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/components/AirportInput.tsx
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/components/CreationForm.tsx
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/components/EventFields.tsx
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/components/FilterTabs.tsx
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/components/FlightFields.tsx
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/components/HotelFields.tsx
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/components/index.ts
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/components/InlineDeleteConfirmation.tsx
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/components/InlineEditor.tsx
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/components/LocalPlacesFields.tsx
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/components/RequestCard.tsx
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/components/RequestCardSkeleton.tsx
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/components/RequestForm.tsx
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/components/SummaryStrip.tsx
- src/TripRadar.WebUI/src/features/scheduledRequests/ui/hooks/useLocationSearch.ts
- src/TripRadar.WebUI/src/entities/scheduledRequests/index.ts
- src/TripRadar.WebUI/src/entities/scheduledRequests/api/index.ts
- src/TripRadar.WebUI/src/entities/scheduledRequests/api/scheduledRequestsApi.ts
- src/TripRadar.WebUI/src/entities/scheduledRequests/api/types.ts
- src/TripRadar.WebUI/src/entities/scheduledRequests/api/useAirportSuggestionsQuery.ts
- src/TripRadar.WebUI/src/entities/scheduledRequests/api/useCreateScheduledRequestMutation.ts
- src/TripRadar.WebUI/src/entities/scheduledRequests/api/useDeleteScheduledExecutionMutation.ts
- src/TripRadar.WebUI/src/entities/scheduledRequests/api/useScheduledExecutionSearchTypesQuery.ts
- src/TripRadar.WebUI/src/entities/scheduledRequests/api/useScheduledExecutionsQuery.ts
- src/TripRadar.WebUI/src/entities/scheduledRequests/api/useUpdateScheduledExecutionConfigurationMutation.ts
- src/TripRadar.WebUI/src/entities/scheduledRequests/api/useUpdateScheduledExecutionQueryMutation.ts
- src/TripRadar.WebUI/src/pages/profile/ui/ProfileScheduledRequests.tsx
- src/TripRadar.Server.API/Services/TripQueryHistorySummaryExpander.cs
- src/TripRadar.Server.API/Contracts/ITripQueryHistorySummaryExpander.cs

## Backend travel entry graph removal — continuation

Traced deleted REST routes to TripVaults/ScheduledExecutions/SearchEngine/PlaceReviews handlers, travel GraphQL query/type graph, API request mappings, and scheduled query updater. No retained customer controller calls these handlers. Replaced the MediatR assembly anchor with the stable application extension type; removed GraphQL registration and its four API package references. Only dedicated tests for removed behavior are deleted, without running them. Existing domain/persistence and shared request/reference/usage types are retained pending their consumer removal. No database changes.

Exact removed paths:
- src/TripRadar.Server.Application/UseCases/TripVaults/Commands/CreateTripVault/CreateTripVaultCommand.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Commands/CreateTripVault/CreateTripVaultCommandValidator.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Commands/CreateTripVault/CreateTripVaultHandler.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Commands/DeleteTripVault/DeleteTripVaultCommand.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Commands/DeleteTripVault/DeleteTripVaultCommandValidator.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Commands/DeleteTripVault/DeleteTripVaultHandler.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Commands/RemoveTripItem/RemoveTripItemByUniqueIdCommand.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Commands/RemoveTripItem/RemoveTripItemByUniqueIdCommandValidator.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Commands/RemoveTripItem/RemoveTripItemByUniqueIdHandler.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Commands/RemoveTripItem/RemoveTripItemCommand.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Commands/RemoveTripItem/RemoveTripItemCommandValidator.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Commands/RemoveTripItem/RemoveTripItemHandler.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Commands/UpdateTripVault/UpdateTripVaultCommand.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Commands/UpdateTripVault/UpdateTripVaultCommandValidator.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Commands/UpdateTripVault/UpdateTripVaultHandler.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Queries/GetRecentTripSearches/GetRecentTripSearchesQuery.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Queries/GetRecentTripSearches/GetRecentTripSearchesQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Queries/GetTripDetails/GetTripDetailsQuery.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Queries/GetTripDetails/GetTripDetailsQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Queries/GetTripQueryHistory/GetTripQueryHistoryQuery.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Queries/GetTripQueryHistory/GetTripQueryHistoryQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Queries/GetTripQueryHistory/GetTripQueryHistoryQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Queries/GetUserTrips/GetUserTripsQuery.cs
- src/TripRadar.Server.Application/UseCases/TripVaults/Queries/GetUserTrips/GetUserTripsQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/ScheduledExecutions/Commands/DeleteScheduledExecution/DeleteScheduledExecutionCommand.cs
- src/TripRadar.Server.Application/UseCases/ScheduledExecutions/Commands/DeleteScheduledExecution/DeleteScheduledExecutionCommandHandler.cs
- src/TripRadar.Server.Application/UseCases/ScheduledExecutions/Commands/DeleteScheduledExecution/DeleteScheduledExecutionCommandValidator.cs
- src/TripRadar.Server.Application/UseCases/ScheduledExecutions/Commands/UpdateScheduledExecutionConfiguration/UpdateScheduledExecutionConfigurationCommand.cs
- src/TripRadar.Server.Application/UseCases/ScheduledExecutions/Commands/UpdateScheduledExecutionConfiguration/UpdateScheduledExecutionConfigurationCommandHandler.cs
- src/TripRadar.Server.Application/UseCases/ScheduledExecutions/Commands/UpdateScheduledExecutionConfiguration/UpdateScheduledExecutionConfigurationCommandValidator.cs
- src/TripRadar.Server.Application/UseCases/ScheduledExecutions/Commands/UpdateScheduledExecutionQuery/UpdateScheduledExecutionQueryCommand.cs
- src/TripRadar.Server.Application/UseCases/ScheduledExecutions/Commands/UpdateScheduledExecutionQuery/UpdateScheduledExecutionQueryCommandHandler.cs
- src/TripRadar.Server.Application/UseCases/ScheduledExecutions/Commands/UpdateScheduledExecutionQuery/UpdateScheduledExecutionQueryCommandValidator.cs
- src/TripRadar.Server.Application/UseCases/ScheduledExecutions/Queries/GetScheduledExecutions/GetScheduledExecutionsQuery.cs
- src/TripRadar.Server.Application/UseCases/ScheduledExecutions/Queries/GetScheduledExecutions/GetScheduledExecutionsQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/ScheduledExecutions/Queries/GetScheduledExecutions/GetScheduledExecutionsQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/ScheduledExecutions/Queries/GetScheduledExecutionSearchTypes/GetScheduledExecutionSearchTypesQuery.cs
- src/TripRadar.Server.Application/UseCases/ScheduledExecutions/Queries/GetScheduledExecutionSearchTypes/GetScheduledExecutionSearchTypesQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Events/Commands/CreateScheduledEventQuery/CreateScheduledEventQueryCommand.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Events/Commands/CreateScheduledEventQuery/CreateScheduledEventQueryCommandValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Events/Commands/CreateScheduledEventQuery/CreateScheduledEventQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Events/Queries/GetEvents/GetEventsQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Events/Queries/GetEvents/GetEventsQueryCustomValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Events/Queries/GetEvents/GetEventsQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Events/Queries/GetEvents/GetEventsQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Commands/CreateScheduledFlightQuery/CreateScheduledFlightQueryCommand.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Commands/CreateScheduledFlightQuery/CreateScheduledFlightQueryCommandValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Commands/CreateScheduledFlightQuery/CreateScheduledFlightQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Queries/GetFlightExplore/GetFlightExploreQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Queries/GetFlightExplore/GetFlightExploreQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Queries/GetFlightExplore/GetFlightExploreQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Queries/GetFlightNearbyPrices/GetFlightNearbyPricesQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Queries/GetFlightNearbyPrices/GetFlightNearbyPricesQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Queries/GetFlightNearbyPrices/GetFlightNearbyPricesQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Queries/GetFlightPriceCalendar/GetFlightPriceCalendarQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Queries/GetFlightPriceCalendar/GetFlightPriceCalendarQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Queries/GetFlightPriceCalendar/GetFlightPriceCalendarQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Queries/GetFlights/GetFlightsQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Queries/GetFlights/GetFlightsQueryCustomValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Queries/GetFlights/GetFlightsQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Flights/Queries/GetFlights/GetFlightsQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/GoogleLightSearch/Queries/GetGoogleLightSearch/GetGoogleLightSearchQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/GoogleLightSearch/Queries/GetGoogleLightSearch/GetGoogleLightSearchQueryCustomValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/GoogleLightSearch/Queries/GetGoogleLightSearch/GetGoogleLightSearchQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/GoogleLightSearch/Queries/GetGoogleLightSearch/GetGoogleLightSearchQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Hotels/Commands/CreateScheduledHotelQuery/CreateScheduledHotelQueryCommand.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Hotels/Commands/CreateScheduledHotelQuery/CreateScheduledHotelQueryCommandValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Hotels/Commands/CreateScheduledHotelQuery/CreateScheduledHotelQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Hotels/Queries/GetHotels/GetHotelsQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Hotels/Queries/GetHotels/GetHotelsQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Hotels/Queries/GetHotels/GetHotelsQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/LocalPlaces/Commands/CreateScheduledLocalPlacesQuery/CreateScheduledLocalPlacesQueryCommand.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/LocalPlaces/Commands/CreateScheduledLocalPlacesQuery/CreateScheduledLocalPlacesQueryCommandValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/LocalPlaces/Commands/CreateScheduledLocalPlacesQuery/CreateScheduledLocalPlacesQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/LocalPlaces/Queries/GetLocalPlaces/GetLocalPlacesQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/LocalPlaces/Queries/GetLocalPlaces/GetLocalPlacesQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/LocalPlaces/Queries/GetLocalPlaces/GetLocalPlacesQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Maps/Queries/GetMaps/GetMapsQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/Maps/Queries/GetMaps/GetMapsQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/MapsDirections/Queries/GetMapsDirections/GetMapsDirectionsQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/MapsDirections/Queries/GetMapsDirections/GetMapsDirectionsQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/MapsDirections/Queries/GetMapsDirections/GetMapsDirectionsQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/MapsPlaceResults/Queries/GetMapsPlaceResults/GetMapsPlaceResultsQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/MapsPlaceResults/Queries/GetMapsPlaceResults/GetMapsPlaceResultsQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/MapsPlaceResults/Queries/GetMapsPlaceResults/GetMapsPlaceResultsQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/OpenTableReviews/Queries/GetOpenTableReviews/GetOpenTableReviewsQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/OpenTableReviews/Queries/GetOpenTableReviews/GetOpenTableReviewsQueryCustomValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/OpenTableReviews/Queries/GetOpenTableReviews/GetOpenTableReviewsQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/OpenTableReviews/Queries/GetOpenTableReviews/GetOpenTableReviewsQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/TripAdvisorPlace/Queries/GetTripAdvisorPlace/GetTripAdvisorPlaceQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/TripAdvisorPlace/Queries/GetTripAdvisorPlace/GetTripAdvisorPlaceQueryCustomValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/TripAdvisorPlace/Queries/GetTripAdvisorPlace/GetTripAdvisorPlaceQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/TripAdvisorPlace/Queries/GetTripAdvisorPlace/GetTripAdvisorPlaceQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/TripAdvisorSearch/Queries/GetTripAdvisorSearch/GetTripAdvisorSearchQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/TripAdvisorSearch/Queries/GetTripAdvisorSearch/GetTripAdvisorSearchQueryCustomValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/TripAdvisorSearch/Queries/GetTripAdvisorSearch/GetTripAdvisorSearchQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/TripAdvisorSearch/Queries/GetTripAdvisorSearch/GetTripAdvisorSearchQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpPlace/Queries/GetYelpPlace/GetYelpPlaceQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpPlace/Queries/GetYelpPlace/GetYelpPlaceQueryCustomValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpPlace/Queries/GetYelpPlace/GetYelpPlaceQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpPlace/Queries/GetYelpPlace/GetYelpPlaceQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpPlaceFullMenu/Queries/GetYelpPlaceFullMenu/GetYelpPlaceFullMenuQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpPlaceFullMenu/Queries/GetYelpPlaceFullMenu/GetYelpPlaceFullMenuQueryCustomValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpPlaceFullMenu/Queries/GetYelpPlaceFullMenu/GetYelpPlaceFullMenuQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpPlaceFullMenu/Queries/GetYelpPlaceFullMenu/GetYelpPlaceFullMenuQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpReviews/Queries/GetYelpReviews/GetYelpReviewsQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpReviews/Queries/GetYelpReviews/GetYelpReviewsQueryCustomValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpReviews/Queries/GetYelpReviews/GetYelpReviewsQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpReviews/Queries/GetYelpReviews/GetYelpReviewsQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpSearch/Queries/GetYelpSearch/GetYelpSearchQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpSearch/Queries/GetYelpSearch/GetYelpSearchQueryCustomValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpSearch/Queries/GetYelpSearch/GetYelpSearchQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YelpSearch/Queries/GetYelpSearch/GetYelpSearchQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YouTubeSearch/Queries/GetYouTubeSearch/GetYouTubeSearchQuery.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YouTubeSearch/Queries/GetYouTubeSearch/GetYouTubeSearchQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/SearchEngine/YouTubeSearch/Queries/GetYouTubeSearch/GetYouTubeSearchQueryValidator.cs
- src/TripRadar.Server.Application/UseCases/PlaceReviews/Queries/GetPlaceReviews/GetPlaceReviewsQuery.cs
- src/TripRadar.Server.Application/UseCases/PlaceReviews/Queries/GetPlaceReviews/GetPlaceReviewsQueryHandler.cs
- src/TripRadar.Server.Application/UseCases/PlaceReviews/Queries/GetPlaceReviews/GetPlaceReviewsQueryValidator.cs
- src/TripRadar.Server.API/GraphQL/Queries/BaseQuery.cs
- src/TripRadar.Server.API/GraphQL/Queries/CurrentGraphQlUserExtensions.cs
- src/TripRadar.Server.API/GraphQL/Queries/Queries.cs
- src/TripRadar.Server.API/GraphQL/Types/EventType.cs
- src/TripRadar.Server.API/GraphQL/Types/FlightType.cs
- src/TripRadar.Server.API/GraphQL/Types/GoogleLightSearchType.cs
- src/TripRadar.Server.API/GraphQL/Types/HotelType.cs
- src/TripRadar.Server.API/GraphQL/Types/LocalPlacesType.cs
- src/TripRadar.Server.API/GraphQL/Types/MapsDirectionsType.cs
- src/TripRadar.Server.API/GraphQL/Types/MapsType.cs
- src/TripRadar.Server.API/GraphQL/Types/OpenTableReviewsType.cs
- src/TripRadar.Server.API/GraphQL/Types/PlaceReviewsType.cs
- src/TripRadar.Server.API/GraphQL/Types/TripAdvisorType.cs
- src/TripRadar.Server.API/GraphQL/Types/YelpType.cs
- src/TripRadar.Server.API/GraphQL/Types/YouTubeSearchType.cs
- src/TripRadar.Server.API/Filters/GraphQLErrorFilter.cs
- src/TripRadar.Server.API/Mappings/EventQueryProfile.cs
- src/TripRadar.Server.API/Mappings/FlightQueryProfile.cs
- src/TripRadar.Server.API/Mappings/HotelQueryProfile.cs
- src/TripRadar.Server.API/Mappings/LocalPlacesQueryProfile.cs
- src/TripRadar.Server.API/Mappings/ScheduledExecutionProfile.cs
- src/TripRadar.Server.API/Mappings/MapsQueryProfile.cs
- src/TripRadar.Server.API/Mappings/PlaceReviewsQueryProfile.cs
- src/TripRadar.Server.Infrastructure/Mappings/MapsQueryProfile.cs
- src/TripRadar.Server.Application/Services/ScheduledExecutionQueryUpdater.cs
- src/TripRadar.Server.Application/Contracts/Services/IScheduledExecutionQueryUpdater.cs
- src/TripRadar.Server.Tests/Scheduling/UpdateScheduledExecutionConfigurationCommandHandlerTests.cs
- src/TripRadar.Server.Tests/Scheduling/CreateScheduledQueryValidatorsTests.cs
- src/TripRadar.Aspire.Tests/FlightSearchFlowTests.cs

## Travel provider and scheduler execution removal

After request/GraphQL removal, the remaining paid SerpApi call path was the scheduled execution strategy graph. Removed that graph and provider clients/orchestrators. Existing queued scheduled execution and history job type signatures remain as inert compatibility entrypoints; actual queue retirement requires an authorized environment operation. Mocks retain source temporarily but are no longer referenced by cloud infrastructure. Generic request/localization/usage/persistence objects are not deleted here.

Removed source files:
- src/TripRadar.Server.Infrastructure/Providers/SerpApi/Client/GoogleSearchFactory.cs
- src/TripRadar.Server.Infrastructure/Providers/SerpApi/Client/SerpApiProvider.cs
- src/TripRadar.Server.Infrastructure/Providers/SerpApi/Extensions/HashtableExtensions.cs
- src/TripRadar.Server.Infrastructure/Providers/SerpApi/Settings/SerpApiSettings.cs
- src/TripRadar.Server.Infrastructure/Services/Providers/SerpApi/SerpApiCacheKeyBuilder.cs
- src/TripRadar.Server.Infrastructure/Services/Providers/SerpApi/SerpApiErrorMapper.cs
- src/TripRadar.Server.Infrastructure/Services/Providers/SerpApi/SerpApiProviderService.cs
- src/TripRadar.Server.Infrastructure/Services/Providers/SerpApi/SerpApiResponseDeserializer.cs
- src/TripRadar.Server.Infrastructure/Services/Handlers/SerpApiHandler.cs
- src/TripRadar.Server.Infrastructure/Extensions/ServiceCollectionExtensions.Providers.cs
- src/TripRadar.Server.Application/Contracts/Providers/ISerpApiProvider.cs
- src/TripRadar.Server.Application/Contracts/Services/Providers/ISerpApiProviderService.cs
- src/TripRadar.Server.Application/Contracts/Services/Providers/ISerpApiQueryExecutor.cs
- src/TripRadar.Server.Application/Services/SerpApiQueryExecutor.cs
- src/TripRadar.Server.Application/Services/FlightQueryOrchestrator.cs
- src/TripRadar.Server.Application/Contracts/Services/IFlightQueryOrchestrator.cs
- src/TripRadar.Server.Application/Services/ReferenceLookupValidator.cs
- src/TripRadar.Server.Application/Contracts/Services/IReferenceLookupValidator.cs
- src/TripRadar.Server.Infrastructure/Services/Strategies/EventExecutionStrategy.cs
- src/TripRadar.Server.Infrastructure/Services/Strategies/FlightExecutionStrategy.cs
- src/TripRadar.Server.Infrastructure/Services/Strategies/HotelExecutionStrategy.cs
- src/TripRadar.Server.Infrastructure/Services/Strategies/LocalPlacesExecutionStrategy.cs
- src/TripRadar.Server.Infrastructure/Services/ScheduledExecutionDetailsQueryService.cs
- src/TripRadar.Server.Infrastructure/Services/ScheduledExecutionValidityService.cs
- src/TripRadar.Server.Infrastructure/Services/HangfireScheduledJobManager.cs
- src/TripRadar.Server.Infrastructure/Services/CronExpressionService.cs
- src/TripRadar.Server.Infrastructure/Contracts/Scheduled/ICronExpressionService.cs
- src/TripRadar.Server.Infrastructure/Contracts/Scheduled/IScheduledJobManager.cs
- src/TripRadar.Server.Infrastructure/Contracts/Scheduled/IScheduledExecutionStrategy.cs
- src/TripRadar.Server.Application/Contracts/Services/IScheduledExecutionDetailsQueryService.cs
- src/TripRadar.Server.Application/Contracts/Services/IScheduledExecutionValidityService.cs
- src/TripRadar.Server.Tests/Scheduling/ScheduledQueryExecutionServiceTests.cs
- src/TripRadar.Server.Tests/Scheduling/ScheduledExecutionDetailsQueryServiceTests.cs
- src/TripRadar.Server.Tests/Scheduling/ScheduledExecutionValidityServiceTests.cs

## Orphan provider/mock/history write infrastructure

After removing all API and scheduler search callers, no cloud producer remains. Remove unused Kafka producer/readiness probe and cloud Kafka package dependency. Bot Kafka code is still a separate retired-host consumer and is not used by cloud auth. Remove exclusively SerpApi mock project source/reference, search response filters and history-writing helpers. Retain encrypted historical persistence and generic usage/auth/payment code. No queue or stored customer data was deleted.

Exact removed files:
- src/TripRadar.Server.Infrastructure/Services/ProducerService.cs
- src/TripRadar.Server.API/HealthChecks/KafkaReadinessHealthCheck.cs
- src/TripRadar.Server.Infrastructure/Services/Providers/BaseProviderService.cs
- src/TripRadar.Server.Infrastructure/Contracts/ISearchResponseFilter.cs
- src/TripRadar.Server.Infrastructure/Contracts/Handlers/ISearchTypeHandler.cs
- src/TripRadar.Server.Infrastructure/Filters/BaseSearchResponseFilter.cs
- src/TripRadar.Server.Infrastructure/Filters/EventResponseFilter.cs
- src/TripRadar.Server.Infrastructure/Filters/FlightResponseFilter.cs
- src/TripRadar.Server.Infrastructure/Filters/HotelResponseFilter.cs
- src/TripRadar.Server.Infrastructure/Filters/LocalPlacesResponseFilter.cs
- src/TripRadar.Server.Application/Behaviors/QueryHistoryBehavior.cs
- src/TripRadar.Server.Infrastructure/Services/TripVaultQuerySaver.cs
- src/TripRadar.Server.Infrastructure/Services/RecentTripSearchQueryService.cs
- src/TripRadar.Server.Infrastructure/Services/FlightRecentSearchPayloadBuilder.cs
- src/TripRadar.Server.Infrastructure/Services/HotelRecentSearchPayloadBuilder.cs
- src/TripRadar.Server.Application/Contracts/Services/ITripVaultQuerySaver.cs
- src/TripRadar.Server.Application/Contracts/Services/IRecentSearchPayloadBuilder.cs
- src/TripRadar.Server.Application/Contracts/Services/IRecentTripSearchQueryService.cs
- src/TripRadar.Server.Tests/TripVaults/TripVaultQuerySaverTests.cs
- src/TripRadar.Server.API/Mappings/TripVaultProfile.cs
- src/TripRadar.Server.Mocks/Builders/SerpApiGoogleEventsResponseBuilder.cs
- src/TripRadar.Server.Mocks/Builders/SerpApiGoogleFlightResponseBuilder.cs
- src/TripRadar.Server.Mocks/Builders/SerpApiGoogleHotelResponseBuilder.cs
- src/TripRadar.Server.Mocks/Builders/SerpApiGoogleLocalResponseBuilder.cs
- src/TripRadar.Server.Mocks/Builders/SerpApiGoogleMapsResponseBuilder.cs
- src/TripRadar.Server.Mocks/Builders/SerpApiGoogleTravelExploreResponseBuilder.cs
- src/TripRadar.Server.Mocks/Builders/SerpApiPlaceReviewsResponseBuilder.cs
- src/TripRadar.Server.Mocks/Builders/SerpApiTripAdvisorPlaceResponseBuilder.cs
- src/TripRadar.Server.Mocks/Builders/SerpApiTripAdvisorSearchResponseBuilder.cs
- src/TripRadar.Server.Mocks/Clients/MockSerpApiProvider.cs
- src/TripRadar.Server.Mocks/Constants/SerpApiEngine.cs
- src/TripRadar.Server.Mocks/Extensions/SerpApiEngineExtensions.cs
- src/TripRadar.Server.Mocks/Extensions/ServiceCollectionExtensions.cs
- src/TripRadar.Server.Mocks/Responses/SerpApi/Events/GoogleEventsResponse.cs
- src/TripRadar.Server.Mocks/Responses/SerpApi/Flights/GoogleFlightResponse.cs
- src/TripRadar.Server.Mocks/Responses/SerpApi/Local/GoogleLocalResponse.cs
- src/TripRadar.Server.Mocks/Responses/SerpApi/Maps/GoogleMapsResponse.cs
- src/TripRadar.Server.Mocks/Responses/SerpApi/MapsReviews/MapsReviewsResponse.cs
- src/TripRadar.Server.Mocks/TripRadar.Server.Mocks.csproj

## Detach scheduled repositories from retained profile operations

Profile timezone updates no longer reschedule travel jobs. Removed scheduled repository DI and unit-of-work dependencies, orphan scheduler query resolver and recurring-registration service. Historical entity/configuration schema remains for expand-only compatibility; no table contraction or queue mutation performed.

- src/TripRadar.Server.Infrastructure/Extensions/ScheduledExecutionServiceExtensions.cs
- src/TripRadar.Server.Infrastructure/Services/RecurringJobService.cs
- src/TripRadar.Server.Application/Contracts/Services/IRecurringJobService.cs
- src/TripRadar.Server.Application/Contracts/Repositories/IScheduledFlightQueryRepository.cs
- src/TripRadar.Server.Infrastructure/Repositories/ScheduledFlightQueryRepository.cs
- src/TripRadar.Server.Application/Contracts/Repositories/IScheduledHotelQueryRepository.cs
- src/TripRadar.Server.Infrastructure/Repositories/ScheduledHotelQueryRepository.cs
- src/TripRadar.Server.Application/Contracts/Repositories/IScheduledEventQueryRepository.cs
- src/TripRadar.Server.Infrastructure/Repositories/ScheduledEventQueryRepository.cs
- src/TripRadar.Server.Application/Contracts/Repositories/IScheduledLocalPlacesQueryRepository.cs
- src/TripRadar.Server.Infrastructure/Repositories/ScheduledLocalPlacesQueryRepository.cs
- src/TripRadar.Server.Application/Contracts/Repositories/IScheduledExecutionRepository.cs
- src/TripRadar.Server.Infrastructure/Repositories/ScheduledExecutionRepository.cs

## Retired bot/MiniApp and unused Aspire hosting source

Reference inventory: independent cloud auth has no Bot/MiniApp project dependency. Only old Aspire Bot hosting referenced the bot; current AppHost does not call any Hosting helper. PriceTrackingFlowTests and fake Telegram fixture exercise removed travel behavior only. Remove source/project references and their exclusive package dependencies. Keep optional Telegram verifier/identity APIs in Server.Infrastructure/API. No database or deployed resources are deleted. Ignored generated files are left untouched.

- src/Aspire/Hosting/Bot/BotExtensions.cs
- src/Aspire/Hosting/Cloudflared/CloudflaredExtensions.cs
- src/Aspire/Hosting/Telegram/TelegramBotResolver.cs
- src/Aspire/Hosting/TripRadar/Constants/TripRadarConstants.Configuration.cs
- src/Aspire/Hosting/TripRadar/Constants/TripRadarConstants.Parameters.cs
- src/Aspire/Hosting/TripRadar/Constants/TripRadarConstants.Runtime.cs
- src/Aspire/Hosting/TripRadar/Constants/TripRadarConstants.WebUi.cs
- src/Aspire/Hosting/TripRadar/Constants/TripRadarConstants.cs
- src/Aspire/Hosting/TripRadar/TripRadarExtensions.cs
- src/Aspire/Hosting/TripRadar/TripRadarNames.cs
- src/Aspire/Hosting/TripRadar/TripRadarOptions.cs
- src/Aspire/Hosting/TripRadar/TripRadarResource.cs
- src/Aspire/Hosting/TripRadar/TripRadarServices.cs
- src/Aspire/Hosting/TripRadar/flags/flagd.json
- src/Aspire/Hosting/Website/WebsiteExtensions.cs
- src/TripRadar.Aspire.Tests/AspireDistributedAppCollection.cs
- src/TripRadar.Aspire.Tests/FakeTelegramServer.cs
- src/TripRadar.Aspire.Tests/PriceTrackingFlowTests.cs
- src/TripRadar.Aspire.Tests/TripRadar.Aspire.Tests.csproj
- src/TripRadar.Bot.Tests/Auth/TokenClaimsReaderTests.cs
- src/TripRadar.Bot.Tests/Configuration/MiniAppConfigEndpointsTests.cs
- src/TripRadar.Bot.Tests/GlobalUsings.cs
- src/TripRadar.Bot.Tests/Notifications/Format/NotificationEnvelopeRendererTests.cs
- src/TripRadar.Bot.Tests/Notifications/Handlers/EventQueryHandlerTests.cs
- src/TripRadar.Bot.Tests/Notifications/Handlers/FlightQueryHandlerTests.cs
- src/TripRadar.Bot.Tests/Notifications/Handlers/HotelQueryHandlerTests.cs
- src/TripRadar.Bot.Tests/Notifications/Handlers/LocalPlacesQueryHandlerTests.cs
- src/TripRadar.Bot.Tests/Notifications/ScheduledQueryConsumerTests.cs
- src/TripRadar.Bot.Tests/Notifications/Tracking/TrackingRegistryTests.cs
- src/TripRadar.Bot.Tests/Telegram/MiniAppLinkBuilderTests.cs
- src/TripRadar.Bot.Tests/Telegram/TelegramEndpointsTests.cs
- src/TripRadar.Bot.Tests/TripRadar.Bot.Tests.csproj
- src/TripRadar.Bot.Tests/TripRadarApi/TripRadarApiClientLookupTests.cs
- src/TripRadar.Bot/Auth/AuthSessionSyncHandler.cs
- src/TripRadar.Bot/Auth/TokenClaimsReader.cs
- src/TripRadar.Bot/Auth/TripRadarTokenClient.cs
- src/TripRadar.Bot/Auth/UserSession.cs
- src/TripRadar.Bot/Auth/UserSessionStore.cs
- src/TripRadar.Bot/Configuration/BotOptions.cs
- src/TripRadar.Bot/Configuration/KafkaConsumerOptions.cs
- src/TripRadar.Bot/Configuration/MiniAppConfigEndpoints.cs
- src/TripRadar.Bot/Models/BotResult.cs
- src/TripRadar.Bot/Notifications/Format/IScheduledQueryHandler.cs
- src/TripRadar.Bot/Notifications/Format/NotificationDispatcher.cs
- src/TripRadar.Bot/Notifications/Format/NotificationEnvelope.cs
- src/TripRadar.Bot/Notifications/Format/NotificationEnvelopeRenderer.cs
- src/TripRadar.Bot/Notifications/Format/NotificationStrings.cs
- src/TripRadar.Bot/Notifications/Format/ServiceType.cs
- src/TripRadar.Bot/Notifications/Handlers/EventQueryHandler.cs
- src/TripRadar.Bot/Notifications/Handlers/FlightQueryHandler.cs
- src/TripRadar.Bot/Notifications/Handlers/HandlerJson.cs
- src/TripRadar.Bot/Notifications/Handlers/HotelQueryHandler.cs
- src/TripRadar.Bot/Notifications/Handlers/LocalPlacesQueryHandler.cs
- src/TripRadar.Bot/Notifications/ScheduledQueryConsumer.cs
- src/TripRadar.Bot/Notifications/Tracking/ITrackingRegistry.cs
- src/TripRadar.Bot/Notifications/Tracking/TrackingRegistry.cs
- src/TripRadar.Bot/Notifications/Tracking/TrackingSnapshot.cs
- src/TripRadar.Bot/Program.cs
- src/TripRadar.Bot/Properties/launchSettings.json
- src/TripRadar.Bot/Telegram/MiniAppLinkBuilder.cs
- src/TripRadar.Bot/Telegram/TelegramBotService.cs
- src/TripRadar.Bot/Telegram/TelegramEndpoints.cs
- src/TripRadar.Bot/Telegram/TelegramWebhookSetup.cs
- src/TripRadar.Bot/TripRadar.Bot.csproj
- src/TripRadar.Bot/TripRadarApi/ActiveTracking.cs
- src/TripRadar.Bot/TripRadarApi/ITripRadarApiClient.cs
- src/TripRadar.Bot/TripRadarApi/TripRadarApiClient.cs
- src/TripRadar.Bot/appsettings.json
- src/TripRadar.MiniApp/Components/Flights/BoardingPass.razor
- src/TripRadar.MiniApp/Components/Flights/BookingProviderCard.razor
- src/TripRadar.MiniApp/Components/Flights/BundleCard.razor
- src/TripRadar.MiniApp/Components/Flights/ContinueBookingBar.razor
- src/TripRadar.MiniApp/Components/Flights/FlightCard.razor
- src/TripRadar.MiniApp/Components/Flights/MultiCityForm.razor
- src/TripRadar.MiniApp/Components/Flights/PassengerSelector.razor
- src/TripRadar.MiniApp/Components/Flights/PopularDestinations.razor
- src/TripRadar.MiniApp/Components/Flights/PriceBarChart.razor
- src/TripRadar.MiniApp/Components/Flights/PriceCalendar.razor
- src/TripRadar.MiniApp/Components/Flights/PriceDistributionBar.razor
- src/TripRadar.MiniApp/Components/Flights/PriceInsightBadge.razor
- src/TripRadar.MiniApp/Components/Flights/TripTypeSelector.razor
- src/TripRadar.MiniApp/Components/Hotels/GuestSelector.razor
- src/TripRadar.MiniApp/Components/Hotels/HotelCard.razor
- src/TripRadar.MiniApp/Components/Layout/FilterSheet.razor
- src/TripRadar.MiniApp/Components/Layout/PageHeader.razor
- src/TripRadar.MiniApp/Components/Shared/AirportAutocomplete.razor
- src/TripRadar.MiniApp/Components/Shared/BottomSheet.razor
- src/TripRadar.MiniApp/Components/Shared/Css.cs
- src/TripRadar.MiniApp/Components/Shared/EmptyState.razor
- src/TripRadar.MiniApp/Components/Shared/ErrorDisplay.razor
- src/TripRadar.MiniApp/Components/Shared/FilterPill.razor
- src/TripRadar.MiniApp/Components/Shared/LoadingSpinner.razor
- src/TripRadar.MiniApp/Configuration/MiniAppAuthOptions.cs
- src/TripRadar.MiniApp/Layout/MainLayout.razor
- src/TripRadar.MiniApp/Layout/MainLayout.razor.css
- src/TripRadar.MiniApp/Localization/SharedResource.cs
- src/TripRadar.MiniApp/Localization/SharedResource.resx
- src/TripRadar.MiniApp/Localization/SharedResource.ru.resx
- src/TripRadar.MiniApp/Models/Common/AirportSuggestion.cs
- src/TripRadar.MiniApp/Models/Common/ApiResponse.cs
- src/TripRadar.MiniApp/Models/Common/AuthModels.cs
- src/TripRadar.MiniApp/Models/Common/CurrencyFormat.cs
- src/TripRadar.MiniApp/Models/Common/PriceTracking.cs
- src/TripRadar.MiniApp/Models/Common/UserProfile.cs
- src/TripRadar.MiniApp/Models/Flights/AirportCountryLookup.cs
- src/TripRadar.MiniApp/Models/Flights/FlightBookingOption.cs
- src/TripRadar.MiniApp/Models/Flights/FlightBundle.cs
- src/TripRadar.MiniApp/Models/Flights/FlightExploreResult.cs
- src/TripRadar.MiniApp/Models/Flights/FlightFilterExtensions.cs
- src/TripRadar.MiniApp/Models/Flights/FlightFilterState.cs
- src/TripRadar.MiniApp/Models/Flights/FlightPriceHistoryPoint.cs
- src/TripRadar.MiniApp/Models/Flights/FlightPriceInsight.cs
- src/TripRadar.MiniApp/Models/Flights/FlightResult.cs
- src/TripRadar.MiniApp/Models/Flights/FlightSearchParams.cs
- src/TripRadar.MiniApp/Models/Flights/ItineraryFlight.cs
- src/TripRadar.MiniApp/Models/Flights/LegType.cs
- src/TripRadar.MiniApp/Models/Flights/MultiCityLeg.cs
- src/TripRadar.MiniApp/Models/Flights/PriceCalendarResult.cs
- src/TripRadar.MiniApp/Models/Flights/RoundTripMode.cs
- src/TripRadar.MiniApp/Models/Hotels/HotelResult.cs
- src/TripRadar.MiniApp/Models/Hotels/HotelSearchParams.cs
- src/TripRadar.MiniApp/Pages/Account.razor
- src/TripRadar.MiniApp/Pages/Alerts.razor
- src/TripRadar.MiniApp/Pages/Auth.razor
- src/TripRadar.MiniApp/Pages/Companion.razor
- src/TripRadar.MiniApp/Pages/Flights/AirportDetail.razor
- src/TripRadar.MiniApp/Pages/Flights/CitySearch.razor
- src/TripRadar.MiniApp/Pages/Flights/FlightBooking.razor
- src/TripRadar.MiniApp/Pages/Flights/FlightResults.razor
- src/TripRadar.MiniApp/Pages/Flights/FlightSearch.razor
- src/TripRadar.MiniApp/Pages/Flights/TripSummary.razor
- src/TripRadar.MiniApp/Pages/Home.razor
- src/TripRadar.MiniApp/Pages/Hotels/HotelDetails.razor
- src/TripRadar.MiniApp/Pages/Hotels/HotelResults.razor
- src/TripRadar.MiniApp/Pages/Hotels/HotelSearch.razor
- src/TripRadar.MiniApp/Pages/NotFound.razor
- src/TripRadar.MiniApp/Pages/PriceGraph.razor
- src/TripRadar.MiniApp/Program.cs
- src/TripRadar.MiniApp/Properties/launchSettings.json
- src/TripRadar.MiniApp/Routes.cs
- src/TripRadar.MiniApp/Routes.razor
- src/TripRadar.MiniApp/Services/Api/AirportApiService.cs
- src/TripRadar.MiniApp/Services/Api/FlightApiService.cs
- src/TripRadar.MiniApp/Services/Api/FlightExploreService.cs
- src/TripRadar.MiniApp/Services/Api/GraphQlQueries.cs
- src/TripRadar.MiniApp/Services/Api/HotelApiService.cs
- src/TripRadar.MiniApp/Services/Api/PriceCalendarService.cs
- src/TripRadar.MiniApp/Services/Api/PriceTrackingApiService.cs
- src/TripRadar.MiniApp/Services/Api/TripRadarApiClient.cs
- src/TripRadar.MiniApp/Services/Api/UserApiService.cs
- src/TripRadar.MiniApp/Services/Localization/AirportNameLocalizer.cs
- src/TripRadar.MiniApp/Services/Localization/CityNameLocalizer.cs
- src/TripRadar.MiniApp/Services/Localization/CountryNameLocalizer.cs
- src/TripRadar.MiniApp/Services/Localization/FlightTranslationProvider.cs
- src/TripRadar.MiniApp/Services/State/AuthState.cs
- src/TripRadar.MiniApp/Services/State/BundlePrefetchService.cs
- src/TripRadar.MiniApp/Services/State/FlightPrefetchService.cs
- src/TripRadar.MiniApp/Services/State/FlightSearchState.cs
- src/TripRadar.MiniApp/Services/State/HotelSearchState.cs
- src/TripRadar.MiniApp/Services/State/MiniAppConfigService.cs
- src/TripRadar.MiniApp/Services/State/TopBarState.cs
- src/TripRadar.MiniApp/Services/State/TrackingState.cs
- src/TripRadar.MiniApp/TripRadar.MiniApp.csproj
- src/TripRadar.MiniApp/_Imports.razor
- src/TripRadar.MiniApp/wwwroot/appsettings.Development.json
- src/TripRadar.MiniApp/wwwroot/appsettings.json
- src/TripRadar.MiniApp/wwwroot/index.html
