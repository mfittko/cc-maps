import MapKit
import SwiftUI
import UIKit

struct ContentView: View {
    @StateObject private var viewModel = BrowseViewModel()
    @State private var isDestinationPickerPresented = false
    @State private var activeShareSheet: ShareSheetPayload?
    @State private var isDestinationOverlayExpanded = true
    @State private var usesManualDestinationChrome = false

    var body: some View {
        NavigationStack {
            GeometryReader { geometry in
                ZStack {
                    Color.clear
                        .frame(width: geometry.size.width, height: geometry.size.height)
                        .background(Color.black)
                        .ignoresSafeArea()

                    TrailMapView(
                        destinations: viewModel.destinations,
                        selectedDestinationID: viewModel.selectedDestinationID,
                        nearbyPreviewDestinationIDs: Set(viewModel.nearbyPreviewDestinations.map(\.id)),
                        primaryTrails: viewModel.primaryTrails,
                        previewTrails: viewModel.previewTrails,
                        routePlan: viewModel.routePlan,
                        isInPlanningMode: viewModel.isInPlanningMode,
                        selectedTrailID: viewModel.selectedTrailID,
                        selectedTrailSegment: viewModel.selectedTrailSegment,
                        selectedRouteDetailSectionEdgeID: viewModel.selectedRouteDetailSectionEdgeID,
                        selectedPlannedSectionEdgeID: viewModel.selectedPlannedSectionEdgeID,
                        routeDisplaySections: viewModel.routeDisplaySections,
                        routePresentationRefreshID: viewModel.routePresentationRefreshID,
                        fitRequestID: viewModel.fitRequestID,
                        restoredMapRegion: viewModel.visibleMapRegion,
                        mapRegionRestoreRequestID: viewModel.mapRegionRestoreRequestID,
                        focusedPlannedSectionCoordinates: viewModel.focusedPlannedSectionCoordinates,
                        plannedSectionFocusRequestID: viewModel.plannedSectionFocusRequestID,
                        currentLocation: viewModel.currentLocation,
                        currentLocationHeading: viewModel.currentLocationHeading,
                        locationFocusRequestID: viewModel.locationFocusRequestID,
                        locationFollowMode: viewModel.locationFollowMode,
                        onDestinationTap: { destinationID in
                            usesManualDestinationChrome = true
                            viewModel.selectDestination(id: destinationID, manual: true)
                        },
                        onTrailTap: { selection in
                            viewModel.selectTrail(selection: selection)
                        },
                        onUserPanWhileLocationFollowing: {
                            viewModel.handleUserPanWhileLocationFollowing()
                        },
                        onRegionDidChange: { region in
                            viewModel.updateVisibleRegion(region)
                        }
                    )
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .ignoresSafeArea()

                    VStack(spacing: 0) {
                        topOverlay
                        mapOverlayControls
                        Spacer(minLength: 0)
                        bottomOverlay
                    }
                    .frame(width: geometry.size.width, height: geometry.size.height, alignment: .top)
                    .padding(.horizontal, 12)
                    .padding(.top, max(geometry.safeAreaInsets.top + 16, 28))
                    .padding(.bottom, max(geometry.safeAreaInsets.bottom + 44, 56))
                }
                .frame(width: geometry.size.width, height: geometry.size.height)
                .ignoresSafeArea()
            }
            .background(Color.black)
            .ignoresSafeArea()
            .toolbar(.hidden, for: .navigationBar)
            .sheet(isPresented: $isDestinationPickerPresented) {
                DestinationPickerSheet(
                    destinations: viewModel.destinations,
                    selectedDestinationID: viewModel.selectedDestinationID,
                    onSelect: { destinationID in
                        usesManualDestinationChrome = true
                        viewModel.selectDestination(id: destinationID, manual: true)
                    }
                )
            }
            .task {
                if !AppConfig.isRunningTests {
                    viewModel.start()
                }
            }
            .onChange(of: viewModel.isManualDestinationSelection) { _, isManualSelection in
                if !isManualSelection {
                    usesManualDestinationChrome = false
                }

                if isManualSelection && usesManualDestinationChrome {
                    isDestinationOverlayExpanded = true
                }
            }
            .onOpenURL { url in
                viewModel.handleIncomingURL(url)
            }
            .sheet(item: $activeShareSheet) { payload in
                ActivityView(items: payload.items, onComplete: payload.onComplete)
            }
        }
    }

    private var topOverlay: some View {
        Group {
            if viewModel.isManualDestinationSelection && usesManualDestinationChrome && isDestinationOverlayExpanded {
                VStack(alignment: .leading, spacing: 10) {
                    Button {
                        isDestinationPickerPresented = true
                    } label: {
                        HStack(spacing: 12) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Destination")
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                Text(viewModel.selectedDestination?.name ?? "Choose destination")
                                    .font(.headline)
                                    .foregroundStyle(.primary)
                                    .lineLimit(1)
                            }

                            Spacer()

                            Image(systemName: "chevron.up.chevron.down")
                                .font(.caption.bold())
                                .foregroundStyle(.secondary)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 12)
                        .background(Color(.secondarySystemGroupedBackground).opacity(0.92), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(.plain)

                    if !viewModel.nearbyPreviewDestinations.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(viewModel.nearbyPreviewDestinations) { destination in
                                    Button(destination.name) {
                                        usesManualDestinationChrome = true
                                        viewModel.selectDestination(id: destination.id, manual: true)
                                    }
                                    .font(.caption.weight(.semibold))
                                    .padding(.horizontal, 12)
                                    .padding(.vertical, 8)
                                    .background(.thinMaterial, in: Capsule())
                                    .foregroundStyle(.orange)
                                }
                            }
                            .padding(.vertical, 2)
                        }
                    }

                    if let error = viewModel.requestError {
                        Text(error)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }
                }
                .padding(.top, 40)
                .padding(.horizontal, 14)
                .padding(.bottom, 14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                .shadow(color: Color.black.opacity(0.08), radius: 18, y: 8)
                .overlay(alignment: .topTrailing) {
                    closeDestinationOverlayButton
                        .padding(12)
                }
            } else if viewModel.isManualDestinationSelection && usesManualDestinationChrome {
                HStack(alignment: .center, spacing: 8) {
                    if viewModel.canEnableAutoLocation {
                        locationFollowButton
                    }
                    manualDestinationMenu
                    Spacer(minLength: 0)
                }
                .padding(.top, 60)
                .padding(.leading, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                HStack(alignment: .center, spacing: 8) {
                    if viewModel.canEnableAutoLocation {
                        locationFollowButton
                    }
                    compactDestinationTogglePill
                    Spacer(minLength: 0)
                }
                .padding(.top, 60)
                .padding(.leading, 16)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    @ViewBuilder
    private var mapOverlayControls: some View {
        if viewModel.canEnableAutoLocation &&
            viewModel.isManualDestinationSelection &&
            usesManualDestinationChrome &&
            isDestinationOverlayExpanded {
            HStack {
                locationFollowButton
                Spacer(minLength: 0)
            }
            .padding(.top, 10)
            .padding(.leading, 4)
        }
    }

    @ViewBuilder
    private var bottomOverlay: some View {
        if viewModel.isInPlanningMode {
            PlanningPanel(
                plan: viewModel.routePlan,
                routeSummary: viewModel.routeSummary,
                elevationResponse: viewModel.routeElevation,
                routeUsesPreviewDestinations: viewModel.routeUsesPreviewDestinations,
                allTrails: viewModel.primaryTrails + viewModel.previewTrails,
                displayOrderedSections: viewModel.routeDisplaySections,
                hydrationNotice: viewModel.routeHydrationNotice,
                selectedSectionEdgeID: viewModel.selectedPlannedSectionEdgeID,
                onExitPlanning: { viewModel.exitPlanningMode() },
                onShareRoute: { presentRouteShareSheet() },
                onExportGpx: { presentGpxExportSheet() },
                watchTransferAvailability: viewModel.watchTransferAvailability,
                watchTransferSendState: viewModel.watchTransferSendState,
                watchTransferStatusTitle: viewModel.watchTransferStatusTitle,
                watchTransferStatusMessage: viewModel.watchTransferStatusMessage,
                watchTransferShouldShowSendButton: viewModel.watchTransferShouldShowSendButton,
                watchTransferButtonLabel: viewModel.watchTransferButtonLabel,
                canSendToWatch: viewModel.canSendRouteToWatch,
                onSendToWatch: { viewModel.sendRouteToWatch() },
                onReverse: { viewModel.reverseRoute() },
                onClear: { viewModel.clearRoute() },
                onRemove: { edgeID in viewModel.removeRouteAnchor(edgeID: edgeID) },
                onSelectSection: { edgeID in viewModel.selectPlannedSection(edgeID: edgeID) }
            )
            .transition(.move(edge: .bottom).combined(with: .opacity))
        } else if let trail = viewModel.selectedTrail {
            TrailDetailCard(
                trail: trail,
                trailSegments: viewModel.selectedTrailSegments,
                selectedSegment: viewModel.selectedTrailSegment,
                routeContext: viewModel.selectedRouteDetailContext
            ) {
                viewModel.selectTrail(id: nil)
            }
            .transition(.move(edge: .bottom).combined(with: .opacity))
        } else if viewModel.trailsPhase == .success {
            HStack(spacing: 10) {
                if !viewModel.routePlan.isEmpty {
                    Button {
                        viewModel.focusPlannedRouteIfAvailable()
                    } label: {
                        Image(systemName: "figure.skiing.crosscountry")
                            .font(.body.weight(.semibold))
                            .frame(width: 34, height: 34)
                            .background(Color(red: 0.08, green: 0.34, blue: 0.44), in: Circle())
                            .foregroundStyle(.white)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Center planned route")
                }
                Text("Tap trail")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 0)
                Circle()
                    .fill(Color.green)
                    .frame(width: 8, height: 8)
                Text("Ready")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 16)

                if viewModel.routeShareArtifact != nil {
                    shareRouteButton
                }

                planRouteButton
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(.ultraThinMaterial, in: Capsule())
            .shadow(color: Color.black.opacity(0.08), radius: 16, y: 6)
        }
    }

    private var planRouteButton: some View {
        Button {
            viewModel.enterPlanningMode()
        } label: {
            Image(systemName: "point.topleft.down.to.point.bottomright.curvepath")
                .font(.body.weight(.semibold))
                .frame(width: 36, height: 36)
                .background(Color.blue.opacity(0.15), in: Capsule())
                .foregroundStyle(.blue)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Enter route planning mode")
    }

    private var shareRouteButton: some View {
        Button {
            presentRouteShareSheet()
        } label: {
            Image(systemName: "link")
                .font(.body.weight(.semibold))
                .frame(width: 36, height: 36)
                .background(Color.blue.opacity(0.15), in: Capsule())
                .foregroundStyle(.blue)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Share route link")
    }

    private var locationFollowButton: some View {
        Button {
            viewModel.toggleLocationFollow()
        } label: {
            Image(systemName: viewModel.locationFollowMode.systemImageName)
                .font(.body.weight(.semibold))
                .frame(width: 44, height: 44)
                .background(.thinMaterial, in: Circle())
                .foregroundStyle(viewModel.isLocationFollowActive ? Color.blue : Color.secondary)
                .contentShape(Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(viewModel.locationFollowMode.accessibilityLabel)
    }

    private var closeDestinationOverlayButton: some View {
        Button {
            isDestinationOverlayExpanded = false
        } label: {
            Image(systemName: "xmark")
                .font(.body.weight(.semibold))
                .frame(width: 32, height: 32)
                .background(Color.black.opacity(0.16), in: Circle())
                .foregroundStyle(.secondary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Close destination selection")
    }

    private var manualDestinationMenu: some View {
        Button {
            usesManualDestinationChrome = true
            isDestinationOverlayExpanded = true
            isDestinationPickerPresented = true
        } label: {
            Label(viewModel.selectedDestination?.name ?? "Choose", systemImage: "line.3.horizontal.decrease.circle")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 14)
                .frame(height: 44)
                .background(.thinMaterial, in: Capsule())
                .foregroundStyle(.primary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open destination selection")
    }

    private var compactDestinationTogglePill: some View {
        Button {
            usesManualDestinationChrome = true
            isDestinationOverlayExpanded = true
            isDestinationPickerPresented = true
        } label: {
            HStack(spacing: 8) {
                Text(viewModel.selectedDestination?.name ?? "Choose")
                    .lineLimit(1)

                Image(systemName: "line.3.horizontal.decrease.circle")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 12)
            .frame(height: 44)
            .background(.thinMaterial, in: Capsule())
            .foregroundStyle(.primary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open destination selection")
    }

    private func presentRouteShareSheet() {
        guard let shareArtifact = viewModel.routeShareArtifact else {
            return
        }

        activeShareSheet = ShareSheetPayload(items: [shareArtifact.url])
    }

    private func presentGpxExportSheet() {
        guard let exportFile = viewModel.makeRouteExportFile(),
              let fileURL = try? exportFile.writeTemporaryFile() else {
            return
        }

        activeShareSheet = ShareSheetPayload(
            items: [fileURL],
            onComplete: {
                try? FileManager.default.removeItem(at: fileURL)
            }
        )
    }

}

private struct DestinationPickerSheet: View {
    let destinations: [Destination]
    let selectedDestinationID: String
    let onSelect: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    private var filteredDestinations: [Destination] {
        let trimmedQuery = searchText.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !trimmedQuery.isEmpty else {
            return destinations
        }

        return destinations.filter { destination in
            destination.name.localizedCaseInsensitiveContains(trimmedQuery)
        }
    }

    var body: some View {
        NavigationStack {
            List(filteredDestinations) { destination in
                Button {
                    onSelect(destination.id)
                    dismiss()
                } label: {
                    HStack(spacing: 12) {
                        Text(destination.name)
                            .foregroundStyle(.primary)

                        Spacer(minLength: 0)

                        if destination.id == selectedDestinationID {
                            Image(systemName: "checkmark")
                                .foregroundStyle(.blue)
                        }
                    }
                }
            }
            .listStyle(.plain)
            .searchable(text: $searchText, prompt: "Search destinations")
            .navigationTitle("Destination")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

private struct TrailDetailCard: View {
    let trail: TrailFeature
    let trailSegments: [TrailSegment]
    let selectedSegment: TrailSegment?
    let routeContext: RouteAwareTrailDetailContext?
    let onClose: () -> Void

    private var sectionCount: Int {
        trailSegments.count
    }

    private var crossingCount: Int {
        max(sectionCount - 1, 0)
    }

    private var selectedSegmentNumber: Int? {
        guard let selectedSegment else {
            return nil
        }

        return trailSegments.firstIndex(where: { segment in
            abs(segment.startDistanceKm - selectedSegment.startDistanceKm) < 0.0001 &&
                abs(segment.endDistanceKm - selectedSegment.endDistanceKm) < 0.0001
        }).map { $0 + 1 }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("TRAIL DETAILS")
                        .font(.caption.weight(.black))
                        .tracking(1.4)
                        .foregroundStyle(.secondary)

                    if trail.trailTypeSymbol != 30 {
                        Text(trail.trailTypeLabel)
                            .font(.title3.weight(.bold))
                    }
                }

                Spacer()

                Button(action: onClose) {
                    Image(systemName: "xmark")
                        .font(.headline.weight(.bold))
                        .frame(width: 32, height: 32)
                        .background(Color.black.opacity(0.08), in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Close trail details")
            }

            if trail.shouldShowDisciplineAvailabilityLine {
                Text("Classic: \(trail.hasClassic == true ? "Yes" : "No") · Skating: \(trail.hasSkating == true ? "Yes" : "No")")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 8) {
                detailChip(label: trail.compactGroomingLabel, systemImage: "hourglass")
                detailChip(label: trail.formattedLengthLabel, systemImage: "ruler")

                if let selectedSegmentNumber,
                   let selectedSegment {
                    detailChip(label: "\(selectedSegmentNumber)/\(sectionCount)", systemImage: "arrow.triangle.branch")
                    detailChip(label: selectedSegment.formattedDistanceLabel, systemImage: "ruler.fill")
                }

                if let routeContext {
                    detailChip(label: routeContext.selectedSectionElevationDetailLabel, systemImage: "mountain.2.fill")
                } else if selectedSegmentNumber == nil, sectionCount > 1 {
                    detailChip(label: "\(sectionCount) sections", systemImage: "arrow.triangle.branch")
                }

                if crossingCount > 0 {
                    detailChip(label: "\(crossingCount) crossings", systemImage: "point.3.connected.trianglepath.dotted")
                }

                if trail.hasFloodlight == true {
                    detailChip(label: "Floodlit", systemImage: "lightbulb.max")
                }
            }

            if let routeContext {
                VStack(alignment: .leading, spacing: 10) {
                    Text("PLANNED ROUTE")
                        .font(.caption.weight(.black))
                        .tracking(1.4)
                        .foregroundStyle(.secondary)

                    HStack(spacing: 8) {
                        detailChip(label: "\(routeContext.selectedSectionNumber)/\(routeContext.totalSections)", systemImage: "arrow.triangle.branch", compact: true)
                        detailChip(label: routeContext.formattedTotalDistanceLabel, systemImage: "map")

                        if let elevationLabel = routeContext.formattedElevationLabel {
                            detailChip(label: elevationLabel, systemImage: "mountain.2", compact: true)
                        } else {
                            Label(RouteSummary.elevationUnavailableNote, systemImage: "mountain.2")
                                .font(.caption2.weight(.semibold))
                                .lineLimit(1)
                                .minimumScaleFactor(0.85)
                                .foregroundStyle(.secondary)
                        }
                    }

                }
            }

            if let warningText = trail.warningText {
                Label(warningText, systemImage: "exclamationmark.triangle.fill")
                    .font(.footnote.weight(.medium))
                    .foregroundStyle(.red)
                    .padding(.top, 2)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 28, style: .continuous))
        .shadow(color: Color.black.opacity(0.14), radius: 24, y: 10)
    }

    private func detailChip(label: String, systemImage: String, compact: Bool = false) -> some View {
        Label(label, systemImage: systemImage)
            .font((compact ? Font.caption2 : Font.caption).weight(.semibold))
            .lineLimit(1)
            .minimumScaleFactor(0.85)
            .padding(.horizontal, compact ? 8 : 10)
            .padding(.vertical, compact ? 7 : 8)
            .background(Color(.secondarySystemGroupedBackground).opacity(0.82), in: Capsule())
    }
}

private struct ShareSheetPayload: Identifiable {
    let id = UUID()
    let items: [Any]
    let onComplete: (() -> Void)?

    init(items: [Any], onComplete: (() -> Void)? = nil) {
        self.items = items
        self.onComplete = onComplete
    }
}

private struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]
    let onComplete: (() -> Void)?

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(activityItems: items, applicationActivities: nil)
        controller.completionWithItemsHandler = { _, _, _, _ in
            onComplete?()
        }
        return controller
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {
    }
}

#Preview {
    ContentView()
}
