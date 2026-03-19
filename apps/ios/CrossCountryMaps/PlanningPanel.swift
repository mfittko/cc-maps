import SwiftUI

struct PlanningPanel: View {
    @State private var isShareExpanded = false

    let plan: RoutePlanState
    let routeSummary: RouteSummary
    let elevationResponse: ElevationApiResponse?
    let routeUsesPreviewDestinations: Bool
    let allTrails: [TrailFeature]
    let hydrationNotice: RoutePlanHydrationNotice?
    let selectedSectionEdgeID: String?
    let onExitPlanning: () -> Void
    let onShareRoute: () -> Void
    let onExportGpx: () -> Void
    let watchTransferAvailability: WatchRouteTransferAvailability
    let watchTransferSendState: WatchRouteTransferSendState
    let watchTransferStatusTitle: String
    let watchTransferStatusMessage: String
    let watchTransferShouldShowSendButton: Bool
    let watchTransferButtonLabel: String
    let canSendToWatch: Bool
    let onSendToWatch: () -> Void
    let onReverse: () -> Void
    let onClear: () -> Void
    let onRemove: (String) -> Void
    let onSelectSection: (String) -> Void

    private var plannedSections: [PlanningSection] {
        GeoMath.planningSections(for: plan.anchorEdgeIDs, allTrails: allTrails)
    }

    private var trailsByID: [String: TrailFeature] {
        Dictionary(uniqueKeysWithValues: allTrails.map { ($0.id, $0) })
    }

    private var sectionElevationsByEdgeID: [String: SectionElevationSummary] {
        guard let elevationResponse else {
            return [:]
        }

        return Dictionary(
            uniqueKeysWithValues: plannedSections.compactMap { section in
                elevationResponse.sectionElevation(for: section.edgeID).map { (section.edgeID, $0) }
            }
        )
    }

    private var anchorListHeight: CGFloat {
        let rowHeight: CGFloat = 35
        return CGFloat(plannedSections.count) * rowHeight
    }

    private var scrollAreaMaxHeight: CGFloat {
        UIScreen.main.bounds.height * 0.35
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header

            if let hydrationNotice {
                hydrationBanner(hydrationNotice)
            }

            if plan.isEmpty {
                emptyState
                watchTransferCard
                    .padding(.horizontal, 16)
                    .padding(.bottom, 14)
            } else {
                routeSummaryView
                    .padding(.horizontal, 16)
                    .padding(.bottom, 10)

                watchTransferCard
                    .padding(.horizontal, 16)
                    .padding(.bottom, 12)

                ScrollView {
                    anchorList
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(height: min(anchorListHeight, scrollAreaMaxHeight))
                Divider()
                    .padding(.horizontal, 16)
                actionRow
            }
        }
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: Color.black.opacity(0.1), radius: 16, y: 6)
    }

    private var header: some View {
        HStack(spacing: 10) {
            Image(systemName: "point.topleft.down.to.point.bottomright.curvepath")
                .foregroundStyle(.blue)
            Text("Plan Route")
                .font(.headline.weight(.semibold))
            Spacer()
            Button(action: onExitPlanning) {
                Text("Done")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.blue)
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Exit planning mode")
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 8)
    }

    private func hydrationBanner(_ hydrationNotice: RoutePlanHydrationNotice) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundStyle(.orange)
                .font(.footnote)

            Text(hydrationNotice.message)
                .font(.footnote)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    private var emptyState: some View {
        HStack(spacing: 8) {
            Image(systemName: "hand.tap")
                .font(.footnote)
                .foregroundStyle(.secondary)
            Text("Tap a trail to add it to your route")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    private var anchorList: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(plannedSections.enumerated()), id: \.element.edgeID) { index, section in
                HStack(spacing: 10) {
                    Text("\(index + 1)")
                        .font(.caption.monospacedDigit().weight(.bold))
                        .foregroundStyle(.primary)
                        .frame(width: 22, alignment: .trailing)

                    Text(trailLabel(for: section))
                        .font(.footnote)
                        .lineLimit(1)

                    Spacer(minLength: 0)

                    if let sectionElevation = sectionElevationsByEdgeID[section.edgeID] {
                        sectionElevationChip(sectionElevation)
                    }

                    Button {
                        onRemove(section.edgeID)
                    } label: {
                        Image(systemName: "minus.circle.fill")
                            .foregroundStyle(.red)
                            .font(.callout)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Remove section \(index + 1)")
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 7)
                .background(
                    (selectedSectionEdgeID == section.edgeID ? Color.blue.opacity(0.14) : Color.clear),
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )
                .contentShape(Rectangle())
                .onTapGesture {
                    onSelectSection(section.edgeID)
                }
                .accessibilityAddTraits(selectedSectionEdgeID == section.edgeID ? [.isSelected] : [])

                if index < plannedSections.count - 1 {
                    Divider()
                        .padding(.leading, 46)
                }
            }
        }
    }

    private var routeSummaryView: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                summaryChip(label: routeSummary.formattedDistanceLabel, systemImage: "ruler")
                summaryChip(
                    label: "\(routeSummary.sectionCount) section\(routeSummary.sectionCount == 1 ? "" : "s")",
                    systemImage: "point.topleft.down.to.point.bottomright.curvepath"
                )
            }

            if let elevationLabel = routeSummary.formattedElevationLabel {
                summaryChip(label: elevationLabel, systemImage: "mountain.2")
            } else {
                Label(RouteSummary.elevationUnavailableNote, systemImage: "mountain.2")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            if routeUsesPreviewDestinations {
                Label("Includes nearby preview sectors", systemImage: "location.viewfinder")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var actionRow: some View {
        HStack(spacing: 10) {
            actionIconButton(
                systemImage: "arrow.left.arrow.right",
                tint: .primary,
                accessibilityLabel: "Reverse route order",
                action: onReverse
            )

            actionIconButton(
                systemImage: isShareExpanded ? "xmark" : "square.and.arrow.up",
                tint: .blue,
                accessibilityLabel: isShareExpanded ? "Collapse share options" : "Show share options"
            ) {
                withAnimation(.easeInOut(duration: 0.2)) {
                    isShareExpanded.toggle()
                }
            }

            if isShareExpanded {
                actionIconButton(
                    systemImage: "link",
                    tint: .blue,
                    accessibilityLabel: "Share route link"
                ) {
                    onShareRoute()
                    withAnimation(.easeInOut(duration: 0.2)) {
                        isShareExpanded = false
                    }
                }

                actionIconButton(
                    systemImage: "square.and.arrow.up.on.square",
                    tint: .blue,
                    accessibilityLabel: "Export route as GPX"
                ) {
                    onExportGpx()
                    withAnimation(.easeInOut(duration: 0.2)) {
                        isShareExpanded = false
                    }
                }
            }

            Spacer(minLength: 0)

            actionIconButton(
                systemImage: "trash",
                tint: .red,
                accessibilityLabel: "Clear all route sections",
                action: onClear
            )
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .animation(.easeInOut(duration: 0.2), value: isShareExpanded)
    }

    private func actionIconButton(
        systemImage: String,
        tint: Color,
        accessibilityLabel: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.body.weight(.semibold))
                .frame(width: 40, height: 40)
                .background(tint.opacity(0.14), in: Capsule())
                .foregroundStyle(tint)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel)
    }

    private func summaryChip(label: String, systemImage: String) -> some View {
        Label(label, systemImage: systemImage)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(Color.white.opacity(0.82), in: Capsule())
    }

    private func sectionElevationChip(_ elevation: SectionElevationSummary) -> some View {
        Label(
            elevation.formattedElevationLabel ?? "No elev.",
            systemImage: "mountain.2"
        )
        .font(.caption2.weight(.semibold))
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .background(Color.white.opacity(0.82), in: Capsule())
        .foregroundStyle(elevation.formattedElevationLabel == nil ? .secondary : .primary)
    }

    private func trailLabel(for section: PlanningSection) -> String {
        guard let trail = trailsByID[section.trailID] else {
            return section.formattedDistanceLabel
        }

        let distanceLabel = section.formattedDistanceLabel

        if trail.trailTypeSymbol == 30 {
            return distanceLabel
        }

        return "\(trail.trailTypeLabel) · \(distanceLabel)"
    }

    private var watchTransferCard: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: watchTransferIconName)
                .font(.callout.weight(.semibold))
                .foregroundStyle(watchTransferTint)
                .frame(width: 24, height: 24)
                .background(watchTransferTint.opacity(0.14), in: Circle())

            VStack(alignment: .leading, spacing: 4) {
                Text(watchTransferStatusTitle)
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.primary)

                Text(watchTransferStatusMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)

            if watchTransferShouldShowSendButton {
                Button(watchTransferButtonLabel, action: onSendToWatch)
                    .font(.caption.weight(.semibold))
                    .buttonStyle(.borderedProminent)
                    .disabled(!canSendToWatch)
            }
        }
        .padding(12)
        .background(Color.white.opacity(0.72), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var watchTransferTint: Color {
        switch watchTransferSendState {
        case .success:
            return .green
        case .failure:
            return .red
        case .pending:
            return .orange
        case .idle:
            return watchTransferAvailability == .ready ? .blue : .secondary
        }
    }

    private var watchTransferIconName: String {
        switch watchTransferSendState {
        case .success:
            return "checkmark.applewatch"
        case .failure:
            return "exclamationmark.applewatch"
        case .pending:
            return "applewatch.radiowaves.left.and.right"
        case .idle:
            return "applewatch"
        }
    }
}
