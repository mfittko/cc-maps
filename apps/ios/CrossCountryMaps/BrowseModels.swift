import CoreLocation
import Foundation
import MapKit

struct CoordinatePair: Decodable, Hashable {
    let longitude: Double
    let latitude: Double

    init(from decoder: Decoder) throws {
        var container = try decoder.unkeyedContainer()
        longitude = try container.decode(Double.self)
        latitude = try container.decode(Double.self)
    }

    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

struct DestinationFeatureCollection: Decodable {
    let features: [DestinationFeature]
}

struct DestinationFeature: Decodable {
    let geometry: PointGeometry
    let properties: DestinationProperties
}

struct PointGeometry: Decodable {
    let coordinates: CoordinatePair
}

struct DestinationProperties: Decodable {
    let id: Int
    let name: String
    let prepSymbol: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case prepSymbol = "prepsymbol"
    }
}

struct Destination: Identifiable, Equatable {
    let id: String
    let name: String
    let prepSymbol: Int?
    let coordinate: CLLocationCoordinate2D

    init(id: String, name: String, prepSymbol: Int?, coordinate: CLLocationCoordinate2D) {
        self.id = id
        self.name = name
        self.prepSymbol = prepSymbol
        self.coordinate = coordinate
    }

    init(feature: DestinationFeature) {
        id = String(feature.properties.id)
        name = feature.properties.name
        prepSymbol = feature.properties.prepSymbol
        coordinate = feature.geometry.coordinates.coordinate
    }

    static func == (lhs: Destination, rhs: Destination) -> Bool {
        lhs.id == rhs.id
    }

    var groomingLabel: String {
        switch prepSymbol {
        case 20:
            return "Prepared within 6 hours"
        case 30:
            return "Prepared more than 6 hours ago"
        case 40:
            return "Prepared more than 18 hours ago"
        case 50:
            return "Prepared more than 48 hours ago"
        case 60:
            return "Prepared more than 14 days ago"
        case 70:
            return "Not prepared this season"
        default:
            return "Preparation status unknown"
        }
    }

    var groomingColorHex: String {
        switch prepSymbol {
        case 20:
            return "#20bf55"
        case 30:
            return "#157f3b"
        case 40:
            return "#f08c24"
        case 50:
            return "#7e57c2"
        case 60:
            return "#d64545"
        case 70:
            return "#7d8894"
        default:
            return "#52606d"
        }
    }
}

struct TrailFeatureCollection: Decodable {
    let features: [TrailFeature]
}

struct TrailFeature: Decodable, Identifiable, Equatable {
    let id: String
    let destinationId: String?
    let trailTypeSymbol: Int?
    let prepSymbol: Int?
    let warningText: String?
    let hasClassic: Bool?
    let hasSkating: Bool?
    let hasFloodlight: Bool?
    let isScooterTrail: Bool?
    let shapeLengthMeters: Double?
    let geometry: TrailGeometry

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let properties = try container.decode(TrailProperties.self, forKey: .properties)

        id = String(properties.id ?? -1)
        destinationId = properties.destinationId.map(String.init)
        trailTypeSymbol = properties.trailTypeSymbol
        prepSymbol = properties.prepSymbol
        warningText = properties.warningText?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
        hasClassic = properties.hasClassic
        hasSkating = properties.hasSkating
        hasFloodlight = properties.hasFloodlight
        isScooterTrail = properties.isScooterTrail
        shapeLengthMeters = properties.shapeLengthMeters
        geometry = try container.decode(TrailGeometry.self, forKey: .geometry)
    }

    enum CodingKeys: String, CodingKey {
        case properties
        case geometry
    }

    struct TrailProperties: Decodable {
        let id: Int?
        let destinationId: Int?
        let trailTypeSymbol: Int?
        let prepSymbol: Int?
        let warningText: String?
        let hasClassic: Bool?
        let hasSkating: Bool?
        let hasFloodlight: Bool?
        let isScooterTrail: Bool?
        let shapeLengthMeters: Double?

        enum CodingKeys: String, CodingKey {
            case id
            case destinationId = "destinationid"
            case trailTypeSymbol = "trailtypesymbol"
            case prepSymbol = "prepsymbol"
            case warningText = "warningtext"
            case hasClassic = "has_classic"
            case hasSkating = "has_skating"
            case hasFloodlight = "has_floodlight"
            case isScooterTrail = "is_scootertrail"
            case shapeLengthMeters = "st_length(shape)"
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            id = container.decodeIntLike(forKey: .id)
            destinationId = container.decodeIntLike(forKey: .destinationId)
            trailTypeSymbol = container.decodeIntLike(forKey: .trailTypeSymbol)
            prepSymbol = container.decodeIntLike(forKey: .prepSymbol)
            warningText = try container.decodeIfPresent(String.self, forKey: .warningText)
            hasClassic = container.decodeBoolLike(forKey: .hasClassic)
            hasSkating = container.decodeBoolLike(forKey: .hasSkating)
            hasFloodlight = container.decodeBoolLike(forKey: .hasFloodlight)
            isScooterTrail = container.decodeBoolLike(forKey: .isScooterTrail)
            shapeLengthMeters = container.decodeDoubleLike(forKey: .shapeLengthMeters)
        }
    }

    var coordinateSets: [[CLLocationCoordinate2D]] {
        geometry.coordinateSets.map { coordinates in
            coordinates.map(\.coordinate)
        }
    }

    var totalLengthKilometers: Double {
        if let shapeLengthMeters, shapeLengthMeters > 0 {
            return shapeLengthMeters / 1000
        }

        return GeoMath.totalLengthKilometers(for: coordinateSets)
    }

    var trailTypeLabel: String {
        switch trailTypeSymbol {
        case 20:
            return "Floodlit"
        case 30:
            return "Machine groomed"
        case 40:
            return "Scooter trail"
        case 50:
            return "Historic trail"
        default:
            return "Other trail"
        }
    }

    var disciplineLabels: [String] {
        var labels: [String] = []

        if hasClassic == true {
            labels.append("Classic")
        }

        if hasSkating == true {
            labels.append("Skating")
        }

        if hasFloodlight == true {
            labels.append("Floodlit")
        }

        if isScooterTrail == true {
            labels.append("Scooter")
        }

        return labels
    }

    var groomingLabel: String {
        switch prepSymbol {
        case 20:
            return "Prepared within 6 hours"
        case 30:
            return "Prepared more than 6 hours ago"
        case 40:
            return "Prepared more than 18 hours ago"
        case 50:
            return "Prepared more than 48 hours ago"
        case 60:
            return "Prepared more than 14 days ago"
        case 70:
            return "Not prepared this season"
        default:
            return "Preparation status unknown"
        }
    }

    var groomingColorHex: String {
        switch prepSymbol {
        case 20:
            return "#20bf55"
        case 30:
            return "#157f3b"
        case 40:
            return "#f08c24"
        case 50:
            return "#7e57c2"
        case 60:
            return "#d64545"
        case 70:
            return "#7d8894"
        default:
            return "#52606d"
        }
    }

    var compactGroomingLabel: String {
        switch prepSymbol {
        case 20:
            return "6h"
        case 30:
            return ">6h"
        case 40:
            return ">18h"
        case 50:
            return ">48h"
        case 60:
            return ">14d"
        case 70:
            return "season"
        default:
            return "?"
        }
    }

    var disciplineSummary: String {
        disciplineLabels.isEmpty ? "No discipline metadata" : disciplineLabels.joined(separator: " • ")
    }

    var formattedLengthLabel: String {
        String(format: "%.1f km", totalLengthKilometers)
    }

    func trailSegments(allTrails: [TrailFeature]) -> [TrailSegment] {
        GeoMath.trailSegments(trail: self, allTrails: allTrails)
    }

    func trailSegmentCount(allTrails: [TrailFeature]) -> Int {
        GeoMath.trailSegments(trail: self, allTrails: allTrails, includeMidpoints: false).count
    }

    func resolvedSegment(
        allTrails: [TrailFeature],
        tapCoordinate: CLLocationCoordinate2D,
        crossingMatchThresholdKm: Double = AppConfig.trailTapThresholdKm
    ) -> TrailSegment? {
        GeoMath.resolvedSegment(
            for: tapCoordinate,
            trail: self,
            allTrails: allTrails,
            crossingMatchThresholdKm: crossingMatchThresholdKm
        )
    }

    var shouldShowDisciplineAvailabilityLine: Bool {
        !(hasClassic == true && hasSkating == true)
    }

    func planningAnchorEdgeIDs(allTrails: [TrailFeature]) -> [String] {
        GeoMath.planningAnchorEdgeIDs(for: self, allTrails: allTrails)
    }

    func containsPlanningAnchorEdgeID(_ edgeID: String, allTrails: [TrailFeature]) -> Bool {
        planningAnchorEdgeIDs(allTrails: allTrails).contains(edgeID)
    }

    func planningSections(allTrails: [TrailFeature]) -> [PlanningSection] {
        GeoMath.planningSections(for: planningAnchorEdgeIDs(allTrails: allTrails), allTrails: allTrails)
    }
}

struct TrailInspectionSelection: Equatable {
    let trailID: String
    let anchorEdgeID: String?
    let segment: TrailSegment?
}

enum TrailGeometry: Decodable, Equatable {
    case line([CoordinatePair])
    case multiLine([[CoordinatePair]])

    enum CodingKeys: String, CodingKey {
        case type
        case coordinates
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)

        switch type {
        case "LineString":
            self = .line(try container.decode([CoordinatePair].self, forKey: .coordinates))
        case "MultiLineString":
            self = .multiLine(try container.decode([[CoordinatePair]].self, forKey: .coordinates))
        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: container,
                debugDescription: "Unsupported geometry type: \(type)"
            )
        }
    }

    var coordinateSets: [[CoordinatePair]] {
        switch self {
        case .line(let coordinates):
            return [coordinates]
        case .multiLine(let coordinates):
            return coordinates
        }
    }
}

enum GeoMath {
    static func distanceKilometers(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> Double {
        let start = CLLocation(latitude: from.latitude, longitude: from.longitude)
        let end = CLLocation(latitude: to.latitude, longitude: to.longitude)
        return start.distance(from: end) / 1000
    }

    static func bearing(from: CLLocationCoordinate2D, to: CLLocationCoordinate2D) -> Double {
        let fromLat = from.latitude * .pi / 180
        let toLat = to.latitude * .pi / 180
        let deltaLng = (to.longitude - from.longitude) * .pi / 180

        let y = sin(deltaLng) * cos(toLat)
        let x = cos(fromLat) * sin(toLat) - sin(fromLat) * cos(toLat) * cos(deltaLng)
        let radians = atan2(y, x)
        return radians * 180 / .pi
    }

    static func totalLengthKilometers(for coordinateSets: [[CLLocationCoordinate2D]]) -> Double {
        coordinateSets.reduce(0) { partialResult, coordinates in
            partialResult + coordinates.indices.dropFirst().reduce(0) { segmentTotal, index in
                segmentTotal + distanceKilometers(from: coordinates[index - 1], to: coordinates[index])
            }
        }
    }

    static func closestDestination(destinations: [Destination], reference: CLLocationCoordinate2D) -> Destination? {
        destinations.min { left, right in
            distanceKilometers(from: left.coordinate, to: reference) < distanceKilometers(from: right.coordinate, to: reference)
        }
    }

    static func destinationsWithinRadius(
        destinations: [Destination],
        reference: CLLocationCoordinate2D,
        radiusKilometers: Double,
        excludedID: String
    ) -> [Destination] {
        destinations
            .filter { destination in
                destination.id != excludedID && distanceKilometers(from: destination.coordinate, to: reference) <= radiusKilometers
            }
            .sorted { left, right in
                distanceKilometers(from: left.coordinate, to: reference) < distanceKilometers(from: right.coordinate, to: reference)
            }
    }

    static func boundedNearbyPreviewDestinations(
        destinations: [Destination],
        reference: CLLocationCoordinate2D,
        radiusKilometers: Double,
        excludedID: String,
        maxCount: Int
    ) -> [Destination] {
        Array(
            destinationsWithinRadius(
                destinations: destinations,
                reference: reference,
                radiusKilometers: radiusKilometers,
                excludedID: excludedID
            )
            .prefix(maxCount)
        )
    }

    static func closestDestinationByTrailProximity(
        destinations: [Destination],
        trails: [TrailFeature],
        reference: CLLocationCoordinate2D,
        thresholdKilometers: Double
    ) -> Destination? {
        let destinationsByID = Dictionary(uniqueKeysWithValues: destinations.map { ($0.id, $0) })
        var bestMatch: (destination: Destination, distance: Double)?

        for trail in trails {
            guard let destinationID = trail.destinationId, let destination = destinationsByID[destinationID] else {
                continue
            }

            let distance = distanceToTrailKilometers(reference: reference, trail: trail)

            guard distance <= thresholdKilometers else {
                continue
            }

            if let bestMatch, bestMatch.distance <= distance {
                continue
            }

            bestMatch = (destination, distance)
        }

        return bestMatch?.destination
    }

    static func distanceToTrailKilometers(reference: CLLocationCoordinate2D, trail: TrailFeature) -> Double {
        trail.coordinateSets.reduce(Double.greatestFiniteMagnitude) { closest, coordinates in
            min(closest, distanceToPolylineKilometers(reference: reference, coordinates: coordinates))
        }
    }

    static func inspectableTrailSelection(
        reference: CLLocationCoordinate2D,
        trails: [TrailFeature],
        trailMatchThresholdKm: Double,
        crossingMatchThresholdKm: Double = 0.01,
        includePlanningAnchor: Bool = false
    ) -> TrailInspectionSelection? {
        guard let nearestTrail = trails.min(by: { left, right in
            distanceToTrailKilometers(reference: reference, trail: left) <
                distanceToTrailKilometers(reference: reference, trail: right)
        }) else {
            return nil
        }

        let nearestDistance = distanceToTrailKilometers(reference: reference, trail: nearestTrail)
        guard nearestDistance <= trailMatchThresholdKm else {
            return nil
        }

        return TrailInspectionSelection(
            trailID: nearestTrail.id,
            anchorEdgeID: includePlanningAnchor
                ? planningAnchorEdgeID(for: nearestTrail, reference: reference, allTrails: trails)
                : nil,
            segment: resolvedSegment(
                for: reference,
                trail: nearestTrail,
                allTrails: trails,
                crossingMatchThresholdKm: crossingMatchThresholdKm
            )
        )
    }

    static func planningAnchorEdgeIDs(for trail: TrailFeature, allTrails: [TrailFeature]) -> [String] {
        planningGraph(in: allTrails)
            .edgesByTrailID[trail.id, default: []]
            .map(\.edgeID)
    }

    static func planningAnchorEdgeIDForTap(
        trailID: String,
        reference: CLLocationCoordinate2D,
        allTrails: [TrailFeature]
    ) -> String? {
        guard let trail = allTrails.first(where: { $0.id == trailID }) else {
            return nil
        }
        return planningAnchorEdgeID(for: trail, reference: reference, allTrails: allTrails)
    }

    static func planningAnchorEdgeID(
        for trail: TrailFeature,
        reference: CLLocationCoordinate2D,
        allTrails: [TrailFeature]
    ) -> String? {
        let trailEdges = planningGraph(in: allTrails)
            .edgesByTrailID[trail.id, default: []]

        guard !trailEdges.isEmpty else {
            return nil
        }

        // Single-edge trail: no segment resolution needed
        if trailEdges.count == 1 {
            return trailEdges[0].edgeID
        }

        // Multi-edge trail: match via resolved segment distances
        if let segment = resolvedSegment(
            for: reference,
            trail: trail,
            allTrails: allTrails
        ) {
            let candidateEdges = trailEdges.filter {
                abs($0.startDistanceKm - segment.startDistanceKm) < 0.0001 &&
                abs($0.endDistanceKm - segment.endDistanceKm) < 0.0001
            }

            if let match = candidateEdges.min(by: { left, right in
                projectedDistance(reference: reference, coordinates: left.coordinates).distanceKm <
                    projectedDistance(reference: reference, coordinates: right.coordinates).distanceKm
            }) {
                return match.edgeID
            }
        }

        // Fallback: pick the edge closest to the tap point
        return trailEdges.min(by: { left, right in
            projectedDistance(reference: reference, coordinates: left.coordinates).distanceKm <
                projectedDistance(reference: reference, coordinates: right.coordinates).distanceKm
        })?.edgeID
    }

    static func planningSections(for anchorEdgeIDs: [String], allTrails: [TrailFeature]) -> [PlanningSection] {
        guard !anchorEdgeIDs.isEmpty else {
            return []
        }

        let descriptorsByID = planningGraph(in: allTrails).edgesByID

        var sections = anchorEdgeIDs.compactMap { edgeID in
            descriptorsByID[edgeID]
        }

        // Orient coordinates so adjacent sections flow continuously
        for i in 1..<sections.count {
            let prevEnd = sections[i - 1].coordinates.last!
            let currStart = sections[i].coordinates.first!
            let currEnd = sections[i].coordinates.last!

            if distanceKilometers(from: prevEnd, to: currEnd) < distanceKilometers(from: prevEnd, to: currStart) {
                sections[i] = sections[i].reversed()
            }
        }

        // Orient the first section based on the second (if available)
        if sections.count >= 2 {
            let firstEnd = sections[0].coordinates.last!
            let secondStart = sections[1].coordinates.first!
            let firstStart = sections[0].coordinates.first!

            if distanceKilometers(from: firstStart, to: secondStart) < distanceKilometers(from: firstEnd, to: secondStart) {
                sections[0] = sections[0].reversed()
            }
        }

        return sections
    }

    static func reorderedAnchorEdgeIDs(_ anchorEdgeIDs: [String], allTrails: [TrailFeature]) -> [String] {
        let graph = planningGraph(in: allTrails)

        guard anchorEdgeIDs.count >= 2 else {
            return anchorEdgeIDs
        }

        let uniqueEdgeIDs = anchorEdgeIDs.reduce(into: [String]()) { result, edgeID in
            guard graph.edgesByID[edgeID] != nil, !result.contains(edgeID) else {
                return
            }

            result.append(edgeID)
        }

        guard uniqueEdgeIDs.count >= 2 else {
            return uniqueEdgeIDs.isEmpty ? anchorEdgeIDs : uniqueEdgeIDs
        }

        let firstEdgeID = uniqueEdgeIDs[0]
        let originalIndexByEdgeID = Dictionary(uniqueKeysWithValues: uniqueEdgeIDs.enumerated().map { ($1, $0) })
        var selectedNeighborMap = Dictionary(uniqueKeysWithValues: uniqueEdgeIDs.map { ($0, [String]()) })

        for leftIndex in 0..<uniqueEdgeIDs.count {
            for rightIndex in (leftIndex + 1)..<uniqueEdgeIDs.count {
                let leftEdgeID = uniqueEdgeIDs[leftIndex]
                let rightEdgeID = uniqueEdgeIDs[rightIndex]

                guard graph.areAdjacent(leftEdgeID, rightEdgeID) else {
                    continue
                }

                selectedNeighborMap[leftEdgeID, default: []].append(rightEdgeID)
                selectedNeighborMap[rightEdgeID, default: []].append(leftEdgeID)
            }
        }

        for edgeID in uniqueEdgeIDs {
            selectedNeighborMap[edgeID]?.sort {
                originalIndexByEdgeID[$0, default: .max] < originalIndexByEdgeID[$1, default: .max]
            }
        }

        var path = [firstEdgeID]
        var visitedEdgeIDs: Set<String> = [firstEdgeID]

        func dfs(currentEdgeID: String) -> Bool {
            if path.count == uniqueEdgeIDs.count {
                return true
            }

            let candidates = (selectedNeighborMap[currentEdgeID] ?? []).filter { !visitedEdgeIDs.contains($0) }

            for nextEdgeID in candidates {
                visitedEdgeIDs.insert(nextEdgeID)
                path.append(nextEdgeID)

                if dfs(currentEdgeID: nextEdgeID) {
                    return true
                }

                path.removeLast()
                visitedEdgeIDs.remove(nextEdgeID)
            }

            return false
        }

        if dfs(currentEdgeID: firstEdgeID) {
            return path
        }

        return path + uniqueEdgeIDs.filter { !visitedEdgeIDs.contains($0) }
    }

    static func resolvedSegment(
        for reference: CLLocationCoordinate2D,
        trail: TrailFeature,
        allTrails: [TrailFeature],
        crossingMatchThresholdKm: Double = 0.01
    ) -> TrailSegment? {
        let segments = trailSegments(trail: trail, allTrails: allTrails, includeMidpoints: false)

        guard segments.count > 1,
              let distanceAlongTrail = distanceAlongTrailKilometers(reference: reference, trail: trail) else {
            return nil
        }

        return segments.first { segment in
            distanceAlongTrail >= segment.startDistanceKm - crossingMatchThresholdKm &&
                distanceAlongTrail <= segment.endDistanceKm + crossingMatchThresholdKm
        }
    }

    static func distanceAlongTrailKilometers(reference: CLLocationCoordinate2D, trail: TrailFeature) -> Double? {
        var bestProjection: PolylineProjection?
        var traversed = 0.0

        for coordinates in trail.coordinateSets {
            if let projection = nearestProjectionOnPolyline(
                reference: reference,
                coordinates: coordinates,
                startingDistanceKm: traversed
            ), bestProjection == nil || projection.distanceKm < bestProjection!.distanceKm {
                bestProjection = projection
            }

            traversed += totalLengthKilometers(for: [coordinates])
        }

        return bestProjection?.distanceAlongTrailKm
    }

    static func distanceToPolylineKilometers(reference: CLLocationCoordinate2D, coordinates: [CLLocationCoordinate2D]) -> Double {
        guard coordinates.count > 1 else {
            return Double.greatestFiniteMagnitude
        }

        var closestDistanceKilometers = Double.greatestFiniteMagnitude

        for index in 1..<coordinates.count {
            let start = coordinates[index - 1]
            let end = coordinates[index]
            closestDistanceKilometers = min(
                closestDistanceKilometers,
                distanceFrom(reference: reference, toSegmentStart: start, end: end)
            )
        }

        return closestDistanceKilometers
    }

    static func mapRect(for trails: [TrailFeature]) -> MKMapRect? {
        let points = trails.flatMap { trail in
            trail.coordinateSets.flatMap { $0 }
        }

        guard let firstCoordinate = points.first else {
            return nil
        }

        return points.dropFirst().reduce(MKMapRect(origin: MKMapPoint(firstCoordinate), size: MKMapSize(width: 0, height: 0))) { rect, coordinate in
            rect.union(MKMapRect(origin: MKMapPoint(coordinate), size: MKMapSize(width: 0, height: 0)))
        }
    }

    private static func distanceFrom(
        reference: CLLocationCoordinate2D,
        toSegmentStart start: CLLocationCoordinate2D,
        end: CLLocationCoordinate2D
    ) -> Double {
        projectedDistance(reference: reference, start: start, end: end).distanceKm
    }

    private static func projectedDistance(
        reference: CLLocationCoordinate2D,
        start: CLLocationCoordinate2D,
        end: CLLocationCoordinate2D
    ) -> (distanceKm: Double, progress: Double) {
        let referenceLatitude = (reference.latitude + start.latitude + end.latitude) / 3
        let projectedPoint = projectToKilometers(coordinate: reference, referenceLatitude: referenceLatitude)
        let projectedStart = projectToKilometers(coordinate: start, referenceLatitude: referenceLatitude)
        let projectedEnd = projectToKilometers(coordinate: end, referenceLatitude: referenceLatitude)
        let deltaX = projectedEnd.x - projectedStart.x
        let deltaY = projectedEnd.y - projectedStart.y

        if deltaX == 0 && deltaY == 0 {
            return (
                distanceKm: hypot(projectedPoint.x - projectedStart.x, projectedPoint.y - projectedStart.y),
                progress: 0
            )
        }

        let projection = (
            (projectedPoint.x - projectedStart.x) * deltaX +
            (projectedPoint.y - projectedStart.y) * deltaY
        ) / (deltaX * deltaX + deltaY * deltaY)
        let clampedProjection = min(1, max(0, projection))
        let projectedX = projectedStart.x + deltaX * clampedProjection
        let projectedY = projectedStart.y + deltaY * clampedProjection

        return (
            distanceKm: hypot(projectedPoint.x - projectedX, projectedPoint.y - projectedY),
            progress: clampedProjection
        )
    }

    private static func projectedDistance(
        reference: CLLocationCoordinate2D,
        coordinates: [CLLocationCoordinate2D]
    ) -> (distanceKm: Double, progress: Double) {
        guard coordinates.count > 1 else {
            return (Double.greatestFiniteMagnitude, 0)
        }

        var bestDistance = Double.greatestFiniteMagnitude
        var bestProgress = 0.0

        for index in 1..<coordinates.count {
            let candidate = projectedDistance(
                reference: reference,
                start: coordinates[index - 1],
                end: coordinates[index]
            )

            if candidate.distanceKm < bestDistance {
                bestDistance = candidate.distanceKm
                bestProgress = candidate.progress
            }
        }

        return (bestDistance, bestProgress)
    }

    private static func nearestProjectionOnPolyline(
        reference: CLLocationCoordinate2D,
        coordinates: [CLLocationCoordinate2D],
        startingDistanceKm: Double
    ) -> PolylineProjection? {
        guard coordinates.count > 1 else {
            return nil
        }

        var closestProjection: PolylineProjection?
        var traversed = startingDistanceKm

        for index in 1..<coordinates.count {
            let start = coordinates[index - 1]
            let end = coordinates[index]
            let segmentLength = distanceKilometers(from: start, to: end)
            let projection = projectedDistance(reference: reference, start: start, end: end)
            let candidate = PolylineProjection(
                distanceKm: projection.distanceKm,
                distanceAlongTrailKm: traversed + segmentLength * projection.progress
            )

            if closestProjection == nil || candidate.distanceKm < closestProjection!.distanceKm {
                closestProjection = candidate
            }

            traversed += segmentLength
        }

        return closestProjection
    }

    private static func projectToKilometers(
        coordinate: CLLocationCoordinate2D,
        referenceLatitude: Double
    ) -> (x: Double, y: Double) {
        let latitudeScale = 110.574
        let longitudeScale = 111.32 * cos(referenceLatitude * .pi / 180)

        return (
            x: coordinate.longitude * longitudeScale,
            y: coordinate.latitude * latitudeScale
        )
    }

    static func warmPlanningGraph(for trails: [TrailFeature]) {
        _ = planningGraph(in: trails)
    }

    private static let cacheLock = NSLock()
    private static var crossingDistancesCache: [String: [Double]] = [:]

    private static func cachedCrossingDistances(trail: TrailFeature, allTrails: [TrailFeature]) -> [Double] {
        let cacheKey = trail.id + "|" + allTrails.map(\.id).joined(separator: ",")
        cacheLock.lock()
        if let cached = crossingDistancesCache[cacheKey] {
            cacheLock.unlock()
            return cached
        }
        cacheLock.unlock()

        let coordinateSets = trail.coordinateSets
        var crossingDistances: [Double] = []
        var traversed = 0.0

        for coordinates in coordinateSets {
            for index in 1..<coordinates.count {
                let segStart = coordinates[index - 1]
                let segEnd = coordinates[index]
                let segLen = distanceKilometers(from: segStart, to: segEnd)

                for candidate in allTrails where candidate.id != trail.id {
                    for candidateCoords in candidate.coordinateSets {
                        for ci in 1..<candidateCoords.count {
                            if let intersection = segmentIntersection(
                                start1: segStart, end1: segEnd,
                                start2: candidateCoords[ci - 1], end2: candidateCoords[ci]
                            ) {
                                let distFromStart = traversed + distanceKilometers(from: segStart, to: intersection)
                                crossingDistances.append(distFromStart)
                            }
                        }
                    }
                }

                traversed += segLen
            }
        }

        cacheLock.lock()
        crossingDistancesCache[cacheKey] = crossingDistances
        cacheLock.unlock()
        return crossingDistances
    }

    private static var planningGraphCache: [String: PlanningGraph] = [:]

    private static func planningGraph(in trails: [TrailFeature]) -> PlanningGraph {
        let signature = trails.map {
            let pointCount = $0.coordinateSets.reduce(0) { $0 + $1.count }
            return "\($0.id):\($0.destinationId ?? ""):\(pointCount):\(Int($0.shapeLengthMeters ?? 0))"
        }.joined(separator: "|")

        cacheLock.lock()
        if let cachedGraph = planningGraphCache[signature] {
            cacheLock.unlock()
            return cachedGraph
        }
        cacheLock.unlock()

        var occurrenceByBaseID: [String: Int] = [:]
        var nodeToEdgeIDs: [String: [String]] = [:]
        var edgesByID: [String: PlanningSection] = [:]
        var edgesByTrailID: [String: [PlanningSection]] = [:]

        for trail in trails {
            let segments = trailSegments(
                trail: trail,
                allTrails: trails,
                includeMidpoints: true
            )

            for segment in segments {
                let coordinates = extractCoordinatesSlice(
                    coordinateSets: trail.coordinateSets,
                    startKm: segment.startDistanceKm,
                    endKm: segment.endDistanceKm
                )

                guard let start = coordinates.first,
                      let end = coordinates.last,
                      coordinates.count >= 2 else {
                    continue
                }

                let baseID = canonicalEdgeBaseID(start: start, end: end)
                let occurrence = occurrenceByBaseID[baseID, default: 0] + 1
                occurrenceByBaseID[baseID] = occurrence
                let edgeID = canonicalEdgeID(baseID: baseID, occurrence: occurrence)

                let section = PlanningSection(
                    trailID: trail.id,
                    edgeID: edgeID,
                    start: start,
                    end: end,
                    distanceKm: segment.distanceKm,
                    coordinates: coordinates,
                    midpoint: segment.midpoint,
                    startDistanceKm: segment.startDistanceKm,
                    endDistanceKm: segment.endDistanceKm
                )

                edgesByID[edgeID] = section
                edgesByTrailID[trail.id, default: []].append(section)

                let startNodeID = canonicalNodeID(for: start)
                let endNodeID = canonicalNodeID(for: end)
                nodeToEdgeIDs[startNodeID, default: []].append(edgeID)
                nodeToEdgeIDs[endNodeID, default: []].append(edgeID)
            }
        }

        var adjacencyByEdgeID: [String: Set<String>] = [:]
        for edgeIDs in nodeToEdgeIDs.values {
            for leftEdgeID in edgeIDs {
                for rightEdgeID in edgeIDs where leftEdgeID != rightEdgeID {
                    adjacencyByEdgeID[leftEdgeID, default: []].insert(rightEdgeID)
                }
            }
        }

        let graph = PlanningGraph(
            edgesByID: edgesByID,
            edgesByTrailID: edgesByTrailID,
            adjacencyByEdgeID: adjacencyByEdgeID
        )
        cacheLock.lock()
        planningGraphCache[signature] = graph
        cacheLock.unlock()
        return graph
    }

    static func extractCoordinatesForSegment(
        coordinateSets: [[CLLocationCoordinate2D]],
        startKm: Double,
        endKm: Double
    ) -> [CLLocationCoordinate2D] {
        extractCoordinatesSlice(coordinateSets: coordinateSets, startKm: startKm, endKm: endKm)
    }

    private static func extractCoordinatesSlice(
        coordinateSets: [[CLLocationCoordinate2D]],
        startKm: Double,
        endKm: Double
    ) -> [CLLocationCoordinate2D] {
        guard endKm >= startKm else {
            return []
        }

        var result: [CLLocationCoordinate2D] = []
        var traversedKm = 0.0

        for coordinates in coordinateSets {
            guard coordinates.count >= 2 else {
                continue
            }

            for index in 1..<coordinates.count {
                let segmentStart = coordinates[index - 1]
                let segmentEnd = coordinates[index]
                let segmentLength = distanceKilometers(from: segmentStart, to: segmentEnd)
                let segmentStartKm = traversedKm
                let segmentEndKm = segmentStartKm + segmentLength
                let overlapStart = max(startKm, segmentStartKm)
                let overlapEnd = min(endKm, segmentEndKm)

                if overlapStart <= overlapEnd + 0.000001 {
                    let startRatio = segmentLength > 0 ? (overlapStart - segmentStartKm) / segmentLength : 0
                    let endRatio = segmentLength > 0 ? (overlapEnd - segmentStartKm) / segmentLength : 0
                    let startCoordinate = CLLocationCoordinate2D(
                        latitude: segmentStart.latitude + (segmentEnd.latitude - segmentStart.latitude) * startRatio,
                        longitude: segmentStart.longitude + (segmentEnd.longitude - segmentStart.longitude) * startRatio
                    )
                    let endCoordinate = CLLocationCoordinate2D(
                        latitude: segmentStart.latitude + (segmentEnd.latitude - segmentStart.latitude) * endRatio,
                        longitude: segmentStart.longitude + (segmentEnd.longitude - segmentStart.longitude) * endRatio
                    )

                    if let last = result.last {
                        if distanceKilometers(from: last, to: startCoordinate) > 0.000001 {
                            result.append(startCoordinate)
                        }
                    } else {
                        result.append(startCoordinate)
                    }

                    if distanceKilometers(from: startCoordinate, to: endCoordinate) > 0.000001 {
                        result.append(endCoordinate)
                    }
                }

                traversedKm += segmentLength
            }
        }

        return result
    }

    private static func canonicalEdgeBaseID(start: CLLocationCoordinate2D, end: CLLocationCoordinate2D) -> String {
        let firstNodeID = canonicalNodeID(for: start)
        let secondNodeID = canonicalNodeID(for: end)
        let orderedNodeIDs = [firstNodeID, secondNodeID].sorted()
        return orderedNodeIDs.joined(separator: "~")
    }

    private static func canonicalEdgeID(baseID: String, occurrence: Int) -> String {
        occurrence > 1 ? "\(baseID):\(occurrence)" : baseID
    }

    private static func canonicalNodeID(for coordinate: CLLocationCoordinate2D) -> String {
        let longitude = roundCoordinateComponent(coordinate.longitude)
        let latitude = roundCoordinateComponent(coordinate.latitude)
        return String(format: "%.6f:%.6f", longitude, latitude)
    }

    private static func roundCoordinateComponent(_ value: Double) -> Double {
        let factor = 1_000_000.0
        return (value * factor).rounded() / factor
    }

    // MARK: - Crossing-based trail segments

    /// Returns the intersection coordinate of two line segments, or nil if they do not intersect.
    /// Segments are expressed as (start, end) pairs in (longitude, latitude) space.
    static func segmentIntersection(
        start1: CLLocationCoordinate2D, end1: CLLocationCoordinate2D,
        start2: CLLocationCoordinate2D, end2: CLLocationCoordinate2D
    ) -> CLLocationCoordinate2D? {
        let d1Lng = end1.longitude - start1.longitude
        let d1Lat = end1.latitude - start1.latitude
        let d2Lng = end2.longitude - start2.longitude
        let d2Lat = end2.latitude - start2.latitude
        let denominator = d1Lng * d2Lat - d1Lat * d2Lng

        guard abs(denominator) > 1e-12 else { return nil }

        let startDeltaLng = start2.longitude - start1.longitude
        let startDeltaLat = start2.latitude - start1.latitude
        let factor1 = (startDeltaLng * d2Lat - startDeltaLat * d2Lng) / denominator
        let factor2 = (startDeltaLng * d1Lat - startDeltaLat * d1Lng) / denominator

        guard factor1 >= 0, factor1 <= 1, factor2 >= 0, factor2 <= 1 else { return nil }

        return CLLocationCoordinate2D(
            latitude: start1.latitude + factor1 * d1Lat,
            longitude: start1.longitude + factor1 * d1Lng
        )
    }

    /// Returns a coordinate linearly interpolated along `coordinateSets` at `distanceKm` from the start.
    static func coordinateAlong(coordinateSets: [[CLLocationCoordinate2D]], distanceKm: Double) -> CLLocationCoordinate2D? {
        var traversed = 0.0
        for coordinates in coordinateSets {
            for index in 1..<coordinates.count {
                let start = coordinates[index - 1]
                let end = coordinates[index]
                let segmentLength = distanceKilometers(from: start, to: end)
                if traversed + segmentLength >= distanceKm {
                    let ratio = segmentLength == 0 ? 0 : (distanceKm - traversed) / segmentLength
                    return CLLocationCoordinate2D(
                        latitude: start.latitude + (end.latitude - start.latitude) * ratio,
                        longitude: start.longitude + (end.longitude - start.longitude) * ratio
                    )
                }
                traversed += segmentLength
            }
        }
        // Return last coordinate when distanceKm >= total length
        return coordinateSets.last?.last
    }

    /// Builds crossing-based trail segments for `trail` against `allTrails` in the same destination.
    ///
    /// Mirrors the JS `getCrossingMetrics` + `buildTrailSegments` logic.
    /// Crossings closer than `dedupThresholdKm` to each other are merged. Segments shorter than
    /// `minSegmentKm` are dropped.
    static func trailSegments(
        trail: TrailFeature,
        allTrails: [TrailFeature],
        minSegmentKm: Double = 0.05,
        dedupThresholdKm: Double = 0.02,
        includeMidpoints: Bool = true
    ) -> [TrailSegment] {
        let coordinateSets = trail.coordinateSets
        let crossingDistances = cachedCrossingDistances(trail: trail, allTrails: allTrails)
        let totalLength = totalLengthKilometers(for: coordinateSets)

        // Sort and dedup crossings that are very close together
        let sortedCrossings = crossingDistances.sorted()
        var uniqueCrossings: [Double] = []
        for d in sortedCrossings {
            if let last = uniqueCrossings.last, abs(last - d) < dedupThresholdKm {
                continue
            }
            uniqueCrossings.append(d)
        }

        // Build path points: start + crossings + end
        var points: [Double] = [0] + uniqueCrossings + [totalLength]

        // Normalise: remove duplicate or very-close points
        points = points.reduce(into: [Double]()) { result, point in
            if let last = result.last, abs(last - point) < dedupThresholdKm {
                result[result.count - 1] = point
            } else {
                result.append(point)
            }
        }

        guard points.count >= 2 else { return [] }

        return zip(points, points.dropFirst()).compactMap { startKm, endKm in
            let distKm = endKm - startKm
            guard distKm >= minSegmentKm else { return nil }
            let midpoint: CLLocationCoordinate2D?

            if includeMidpoints {
                let midKm = startKm + distKm / 2
                midpoint = coordinateAlong(coordinateSets: coordinateSets, distanceKm: midKm)
            } else {
                midpoint = nil
            }

            return TrailSegment(
                startDistanceKm: startKm,
                endDistanceKm: endKm,
                distanceKm: distKm,
                midpoint: midpoint
            )
        }
    }
}

struct PlanningEdgeDescriptor {
    let trailID: String
    let edgeID: String
    let start: CLLocationCoordinate2D
    let end: CLLocationCoordinate2D
}

struct PlanningSection: Equatable {
    let trailID: String
    let edgeID: String
    let start: CLLocationCoordinate2D
    let end: CLLocationCoordinate2D
    let distanceKm: Double
    let coordinates: [CLLocationCoordinate2D]
    let midpoint: CLLocationCoordinate2D?
    let startDistanceKm: Double
    let endDistanceKm: Double

    static func == (lhs: PlanningSection, rhs: PlanningSection) -> Bool {
        lhs.trailID == rhs.trailID &&
        lhs.edgeID == rhs.edgeID &&
        lhs.start.latitude == rhs.start.latitude &&
        lhs.start.longitude == rhs.start.longitude &&
        lhs.end.latitude == rhs.end.latitude &&
        lhs.end.longitude == rhs.end.longitude &&
        lhs.distanceKm == rhs.distanceKm
    }

    var formattedDistanceLabel: String {
        String(format: "%.1f km", distanceKm)
    }

    func reversed() -> PlanningSection {
        PlanningSection(
            trailID: trailID,
            edgeID: edgeID,
            start: end,
            end: start,
            distanceKm: distanceKm,
            coordinates: coordinates.reversed(),
            midpoint: midpoint,
            startDistanceKm: startDistanceKm,
            endDistanceKm: endDistanceKm
        )
    }
}

struct PlanningGraph {
    let edgesByID: [String: PlanningSection]
    let edgesByTrailID: [String: [PlanningSection]]
    let adjacencyByEdgeID: [String: Set<String>]

    func areAdjacent(_ leftEdgeID: String, _ rightEdgeID: String) -> Bool {
        adjacencyByEdgeID[leftEdgeID]?.contains(rightEdgeID) == true
    }
}

struct TrailSegment: Equatable {
    let startDistanceKm: Double
    let endDistanceKm: Double
    let distanceKm: Double
    let midpoint: CLLocationCoordinate2D?

    static func == (lhs: TrailSegment, rhs: TrailSegment) -> Bool {
        lhs.startDistanceKm == rhs.startDistanceKm &&
        lhs.endDistanceKm == rhs.endDistanceKm &&
        lhs.distanceKm == rhs.distanceKm
    }

    var formattedDistanceLabel: String {
        String(format: "%.1f km", distanceKm)
    }
}

private struct PolylineProjection {
    let distanceKm: Double
    let distanceAlongTrailKm: Double
}

private extension KeyedDecodingContainer {
    func decodeIntLike(forKey key: Key) -> Int? {
        if let value = try? decodeIfPresent(Int.self, forKey: key) {
            return value
        }

        if let value = try? decodeIfPresent(Double.self, forKey: key) {
            return Int(value)
        }

        if let value = try? decodeIfPresent(String.self, forKey: key) {
            return Int(value)
        }

        return nil
    }

    func decodeDoubleLike(forKey key: Key) -> Double? {
        if let value = try? decodeIfPresent(Double.self, forKey: key) {
            return value
        }

        if let value = try? decodeIfPresent(Int.self, forKey: key) {
            return Double(value)
        }

        if let value = try? decodeIfPresent(String.self, forKey: key) {
            return Double(value)
        }

        return nil
    }

    func decodeBoolLike(forKey key: Key) -> Bool? {
        if let value = try? decodeIfPresent(Bool.self, forKey: key) {
            return value
        }

        if let value = try? decodeIfPresent(Int.self, forKey: key) {
            return value != 0
        }

        if let value = try? decodeIfPresent(String.self, forKey: key) {
            switch value.lowercased() {
            case "1", "true", "yes":
                return true
            case "0", "false", "no":
                return false
            default:
                return nil
            }
        }

        return nil
    }
}

private extension String {
    var nilIfEmpty: String? {
        isEmpty ? nil : self
    }
}