import MapKit
import SwiftUI

struct ContentView: View {
    @StateObject private var viewModel = BrowseViewModel()
    @State private var isDestinationPickerPresented = false

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
                        selectedTrailID: viewModel.selectedTrailID,
                        fitRequestID: viewModel.fitRequestID,
                        currentLocation: viewModel.currentLocation,
                        locationFocusRequestID: viewModel.locationFocusRequestID,
                        isAutoFollowEnabled: !viewModel.isManualDestinationSelection,
                        onDestinationTap: { destinationID in
                            viewModel.selectDestination(id: destinationID, manual: true)
                        },
                        onTrailTap: { selection in
                            viewModel.selectTrail(selection: selection)
                        },
                        onRegionDidChange: { center in
                            viewModel.updateVisibleRegionCenter(center)
                        }
                    )
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .ignoresSafeArea()

                    VStack(spacing: 0) {
                        topOverlay
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
                        viewModel.selectDestination(id: destinationID, manual: true)
                    }
                )
            }
            .task {
                if !AppConfig.isRunningTests {
                    viewModel.start()
                }
            }
        }
    }

    private var topOverlay: some View {
        Group {
            if viewModel.isManualDestinationSelection {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(alignment: .top, spacing: 12) {
                        Spacer()

                        autoFollowButton
                    }

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
                        .background(Color.white.opacity(0.92), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                    .buttonStyle(.plain)

                    if !viewModel.nearbyPreviewDestinations.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 8) {
                                ForEach(viewModel.nearbyPreviewDestinations) { destination in
                                    Button(destination.name) {
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
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                .shadow(color: Color.black.opacity(0.08), radius: 18, y: 8)
            } else {
                HStack(spacing: 8) {
                    manualDestinationMenu
                    Spacer(minLength: 0)
                    autoFollowButton
                }
                .padding(.horizontal, 4)
            }
        }
    }

    @ViewBuilder
    private var bottomOverlay: some View {
        if viewModel.isInPlanningMode {
            PlanningPanel(
                plan: viewModel.routePlan,
                allTrails: viewModel.primaryTrails + viewModel.previewTrails,
                onExitPlanning: { viewModel.exitPlanningMode() },
                onReverse: { viewModel.reverseRoute() },
                onClear: { viewModel.clearRoute() },
                onRemove: { index in viewModel.removeRouteAnchor(at: index) }
            )
            .transition(.move(edge: .bottom).combined(with: .opacity))
        } else if let trail = viewModel.selectedTrail {
            TrailDetailCard(
                trail: trail,
                allTrails: viewModel.primaryTrails + viewModel.previewTrails,
                selectedSegment: viewModel.selectedTrailSegment
            ) {
                viewModel.selectTrail(id: nil)
            }
            .transition(.move(edge: .bottom).combined(with: .opacity))
        } else if viewModel.trailsPhase == .success {
            HStack(spacing: 10) {
                Image(systemName: "figure.skiing.crosscountry")
                    .foregroundStyle(Color(red: 0.08, green: 0.34, blue: 0.44))
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
            Label("Plan", systemImage: "point.topleft.down.to.point.bottomright.curvepath")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(Color.blue.opacity(0.15), in: Capsule())
                .foregroundStyle(.blue)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Enter route planning mode")
    }

    private var autoFollowButton: some View {
        Button {
            viewModel.enableAutoLocation()
        } label: {
            Label(
                viewModel.isManualDestinationSelection ? "Manual" : "Auto",
                systemImage: viewModel.isManualDestinationSelection ? "hand.tap.fill" : "location.fill"
            )
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(.thinMaterial, in: Capsule())
            .foregroundStyle(viewModel.isManualDestinationSelection ? .orange : .blue)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Enable automatic location follow")
    }

    private var manualDestinationMenu: some View {
        Button {
            isDestinationPickerPresented = true
        } label: {
            Label("Choose", systemImage: "line.3.horizontal.decrease.circle")
                .font(.caption.weight(.semibold))
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(.thinMaterial, in: Capsule())
                .foregroundStyle(.primary)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Choose destination manually")
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
    let allTrails: [TrailFeature]
    let selectedSegment: TrailSegment?
    let onClose: () -> Void

    private var trailSegments: [TrailSegment] {
        trail.trailSegments(allTrails: allTrails)
    }

    private var sectionCount: Int {
        trailSegments.count
    }

    private var crossingCount: Int {
        max(sectionCount - 1, 0)
    }

    private var selectedSectionIndex: Int? {
        guard let selectedSegment else {
            return nil
        }

        return trailSegments.firstIndex(of: selectedSegment).map { $0 + 1 }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("TRAIL DETAILS")
                        .font(.caption.weight(.black))
                        .tracking(1.4)
                        .foregroundStyle(.secondary)

                    Text(trail.trailTypeLabel)
                        .font(.title3.weight(.bold))
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

                if let selectedSegment, let selectedSectionIndex {
                    detailChip(label: "Section \(selectedSectionIndex)/\(sectionCount)", systemImage: "arrow.triangle.branch")
                    detailChip(label: selectedSegment.formattedDistanceLabel, systemImage: "ruler.fill")
                } else if sectionCount > 1 {
                    detailChip(label: "\(sectionCount) sections", systemImage: "arrow.triangle.branch")
                }

                if crossingCount > 0 {
                    detailChip(label: "\(crossingCount) crossings", systemImage: "point.3.connected.trianglepath.dotted")
                }

                if trail.hasFloodlight == true {
                    detailChip(label: "Floodlit", systemImage: "lightbulb.max")
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

    private func detailChip(label: String, systemImage: String) -> some View {
        Label(label, systemImage: systemImage)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color.white.opacity(0.82), in: Capsule())
    }
}

#Preview {
    ContentView()
}