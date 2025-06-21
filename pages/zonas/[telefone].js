import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { GoogleMap, LoadScript, Polygon, Marker } from '@react-google-maps/api';
import { 
  Box, 
  Heading, 
  Input, 
  Button, 
  Text, 
  useToast, 
  VStack, 
  Flex, 
  HStack, 
  Container, 
  Divider,
  IconButton,
  useColorMode,
  useColorModeValue,
  Stack,
  useBreakpointValue
} from '@chakra-ui/react';
import { supabase } from '../../lib/supabase';

const GOOGLE_MAPS_KEY = 'AIzaSyD1DL2b2Gy91nOOxiQn5CqlX0fciTER4E0';

// Coordenadas do Brasil
const BRASIL_BOUNDS = {
  north: 5.27438,   // Ponto mais ao norte
  south: -33.75117, // Ponto mais ao sul
  west: -73.98554,  // Ponto mais a oeste
  east: -34.79299   // Ponto mais a leste
};

const defaultCenter = { lat: -15.7801, lng: -47.9292 }; // Brasília - Centro do Brasil
const defaultZoom = 4; // Zoom para mostrar o Brasil inteiro

const colors = [
  '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#800000', '#008000', '#000080', '#808000', '#800080', '#008080'
];

export default function ZonasPage() {
  const router = useRouter();
  const { telefone } = router.query;
  const toast = useToast();
  const { colorMode, toggleColorMode } = useColorMode();
  const isMobile = useBreakpointValue({ base: true, md: false });

  // Valores que mudam com o tema
  const bgColor = useColorModeValue('white', 'gray.900');
  const cardBg = useColorModeValue('white', 'gray.800');
  const textColor = useColorModeValue('gray.700', 'gray.100');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const highlightBorderColor = useColorModeValue('blue.200', 'blue.500');
  const subtitleColor = useColorModeValue('gray.600', 'gray.400');
  const inputBg = useColorModeValue('white', 'gray.700');

  const [zonas, setZonas] = useState([]);
  const [currentZona, setCurrentZona] = useState({ nome: '', pontos: [] });
  const [isDrawing, setIsDrawing] = useState(false);
  const [editingZona, setEditingZona] = useState(null);
  const [selectedVertex, setSelectedVertex] = useState(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [mapConfig, setMapConfig] = useState({
    center: defaultCenter,
    zoom: defaultZoom,
    bounds: null
  });

  useEffect(() => {
    if (telefone) {
      carregarZonas();
    }
  }, [telefone]);

  // Novo useEffect para ajustar o mapa quando as zonas forem carregadas
  useEffect(() => {
    if (mapInstance && zonas.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      zonas.forEach(zona => {
        zona.pontos.forEach(point => {
          bounds.extend(new google.maps.LatLng(point.lat, point.lng));
        });
      });

      // Expande os limites em 20% para melhor visualização
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const latSpan = ne.lat() - sw.lat();
      const lngSpan = ne.lng() - sw.lng();
      
      bounds.extend(new google.maps.LatLng(
        sw.lat() - latSpan * 0.1,
        sw.lng() - lngSpan * 0.1
      ));
      bounds.extend(new google.maps.LatLng(
        ne.lat() + latSpan * 0.1,
        ne.lng() + lngSpan * 0.1
      ));

      // Ajusta o mapa para os limites calculados
      mapInstance.fitBounds(bounds);
      
      // Limita o zoom máximo para não aproximar demais
      const listener = mapInstance.addListener('idle', () => {
        if (mapInstance.getZoom() > 15) {
          mapInstance.setZoom(15);
        }
        google.maps.event.removeListener(listener);
      });
    }
  }, [mapInstance, zonas]);

  const carregarZonas = async () => {
    try {
      const { data, error } = await supabase
        .from('zonas_entrega')
        .select('*')
        .eq('telefone', telefone);

      if (error) throw error;

      if (data) {
        const zonasFormatadas = data.map(zona => ({
          ...zona,
          pontos: Array.isArray(zona.pontos) ? zona.pontos : JSON.parse(zona.pontos)
        }));
        
        setZonas(zonasFormatadas);
        
        // Se não existem zonas, configura o mapa para mostrar o Brasil inteiro
        if (zonasFormatadas.length === 0) {
          setMapConfig({
            center: defaultCenter,
            zoom: defaultZoom
          });
        }
      }
    } catch (error) {
      console.error('Erro ao carregar zonas:', error);
      toast({
        title: "Erro ao carregar zonas",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const handleMapClick = (e) => {
    if (isDrawing) {
      const newPoint = {
        lat: e.latLng.lat(),
        lng: e.latLng.lng()
      };
      setCurrentZona(prev => ({
        ...prev,
        pontos: [...prev.pontos, newPoint]
      }));
    }
  };

  const handleZonaClick = (zona, index) => {
    if (isDrawing) return;
    setEditingZona({ ...zona, index });
  };

  const handleNewVertexDrag = (e, vertexIndex) => {
    const newPoint = {
      lat: e.latLng.lat(),
      lng: e.latLng.lng()
    };
    
    setCurrentZona(prev => ({
      ...prev,
      pontos: prev.pontos.map((point, idx) => 
        idx === vertexIndex ? newPoint : point
      )
    }));
  };

  const handleRemoveVertex = (vertexIndex) => {
    if (currentZona.pontos.length > 3) {
      setCurrentZona(prev => ({
        ...prev,
        pontos: prev.pontos.filter((_, idx) => idx !== vertexIndex)
      }));
    } else {
      toast({
        title: "Não é possível remover",
        description: "Uma zona precisa ter no mínimo 3 pontos",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const salvarEdicao = async () => {
    if (!editingZona) return;

    try {
      const { error } = await supabase
        .from('zonas_entrega')
        .update({
          pontos: JSON.stringify(zonas[editingZona.index].pontos)
        })
        .eq('id', editingZona.id);

      if (error) throw error;

      toast({
        title: 'Zona atualizada com sucesso!',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      setEditingZona(null);
      setSelectedVertex(null);
    } catch (error) {
      toast({
        title: 'Erro ao atualizar zona',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const salvarZona = async () => {
    if (!currentZona.nome || currentZona.pontos.length < 3) {
      toast({
        title: 'Dados inválidos',
        description: 'Preencha o nome e selecione pelo menos 3 pontos',
        status: 'warning',
        duration: 5000,
        isClosable: true,
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('zonas_entrega')
        .insert([{
          nome: currentZona.nome,
          pontos: JSON.stringify(currentZona.pontos),
          telefone: telefone
        }])
        .select();

      if (error) throw error;

      toast({
        title: 'Zona salva com sucesso!',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      setCurrentZona({ nome: '', pontos: [] });
      setIsDrawing(false);
      carregarZonas();
    } catch (error) {
      toast({
        title: 'Erro ao salvar zona',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const calcularCentro = (pontos) => {
    const lat = pontos.reduce((sum, point) => sum + point.lat, 0) / pontos.length;
    const lng = pontos.reduce((sum, point) => sum + point.lng, 0) / pontos.length;
    return { lat, lng };
  };

  const excluirZona = async () => {
    if (!editingZona) return;

    try {
      const { error } = await supabase
        .from('zonas_entrega')
        .delete()
        .eq('id', editingZona.id);

      if (error) throw error;

      toast({
        title: 'Zona excluída com sucesso!',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });

      setEditingZona(null);
      setSelectedVertex(null);
      carregarZonas();
    } catch (error) {
      toast({
        title: 'Erro ao excluir zona',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const hasZonaChanged = () => {
    if (!editingZona) return false;
    const currentPoints = JSON.stringify(zonas[editingZona.index].pontos);
    return currentPoints !== editingZona.originalPoints;
  };

  const handleMapLoad = (map) => {
    setMapInstance(map);
    
    // Se já temos zonas carregadas, ajusta o mapa para elas
    if (zonas.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      zonas.forEach(zona => {
        zona.pontos.forEach(point => {
          bounds.extend(new google.maps.LatLng(point.lat, point.lng));
        });
      });

      // Expande os limites em 10% para melhor visualização
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const latSpan = ne.lat() - sw.lat();
      const lngSpan = ne.lng() - sw.lng();
      
      bounds.extend(new google.maps.LatLng(
        sw.lat() - latSpan * 0.1,
        sw.lng() - lngSpan * 0.1
      ));
      bounds.extend(new google.maps.LatLng(
        ne.lat() + latSpan * 0.1,
        ne.lng() + lngSpan * 0.1
      ));

      map.fitBounds(bounds);
      
      // Limita o zoom máximo para não aproximar demais
      const listener = map.addListener('idle', () => {
        if (map.getZoom() > 15) {
          map.setZoom(15);
        }
        google.maps.event.removeListener(listener);
      });
    } else {
      // Se não há zonas, mostra o Brasil inteiro
      map.fitBounds(new google.maps.LatLngBounds(
        new google.maps.LatLng(BRASIL_BOUNDS.south, BRASIL_BOUNDS.west),
        new google.maps.LatLng(BRASIL_BOUNDS.north, BRASIL_BOUNDS.east)
      ));
    }
  };

  return (
    <Box p={[2, 4]} maxWidth="100vw" height="100vh" bg={bgColor} transition="background-color 0.2s">
      <Container maxW="container.xl" h="100%">
        <VStack spacing={[3, 6]} h="100%">
          <Flex
            direction="column"
            align="center"
            w="100%"
            position="relative"
            pt={2}
          >
            <IconButton
              aria-label="Alternar tema"
              icon={<span>{colorMode === 'dark' ? '☀️' : '🌙'}</span>}
              position={["static", "absolute"]}
              right="0"
              top="0"
              onClick={toggleColorMode}
              variant="ghost"
              size={["md", "lg"]}
              mb={[2, 0]}
            />
            <Heading
              fontSize={["2xl", "3xl"]}
              bgGradient={colorMode === 'dark' 
                ? "linear(to-r, blue.400, teal.400)"
                : "linear(to-r, blue.500, teal.500)"}
              bgClip="text"
              letterSpacing="tight"
              mb={2}
            >
              MDelivery
            </Heading>
            <Text
              fontSize={["md", "lg"]}
              color={subtitleColor}
              fontWeight="medium"
              textAlign="center"
            >
              Gerenciando Zonas de Entrega
            </Text>
          </Flex>

          <Box 
            p={[3, 6]}
            bg={cardBg}
            borderRadius="xl"
            boxShadow="sm"
            w="100%"
            borderWidth={1}
            borderColor={editingZona ? highlightBorderColor : borderColor}
          >
            {editingZona ? (
              <VStack spacing={4} align="stretch">
                <Stack
                  direction={["column", "row"]}
                  justify="space-between"
                  align={["stretch", "center"]}
                >
                  <Text
                    fontSize={["md", "lg"]}
                    color={textColor}
                    fontWeight="semibold"
                  >
                    ✏️ Editando: {editingZona.nome}
                  </Text>
                  <Button
                    size={["sm", "md"]}
                    variant="ghost"
                    onClick={() => {
                      setEditingZona(null);
                      setSelectedVertex(null);
                      carregarZonas();
                    }}
                  >
                    Cancelar Edição
                  </Button>
                </Stack>
                
                <Text fontSize="sm" textAlign="center" color={subtitleColor}>
                  Arraste os pontos vermelhos para ajustar a forma da zona
                </Text>
                
                <Divider />
                
                <Stack
                  direction={["column", "row"]}
                  spacing={4}
                  justify="flex-end"
                >
                  <Button
                    colorScheme="red"
                    variant="ghost"
                    onClick={excluirZona}
                    leftIcon={<span>🗑️</span>}
                    w={["100%", "auto"]}
                  >
                    Excluir
                  </Button>
                  <Button
                    colorScheme="blue"
                    onClick={salvarEdicao}
                    isDisabled={!hasZonaChanged()}
                    leftIcon={<span>💾</span>}
                    w={["100%", "auto"]}
                  >
                    Salvar Alterações
                  </Button>
                </Stack>
              </VStack>
            ) : (
              <VStack spacing={4} align="stretch">
                <Input
                  placeholder="Nome da nova zona"
                  value={currentZona.nome}
                  onChange={(e) => setCurrentZona(prev => ({ ...prev, nome: e.target.value }))}
                  size={["md", "lg"]}
                  bg={inputBg}
                  borderColor={borderColor}
                  _focus={{ borderColor: "blue.400", boxShadow: "none" }}
                />
                
                <Text fontSize="sm" textAlign="center" color={subtitleColor}>
                  {isDrawing 
                    ? "🎯 Clique no mapa para adicionar pontos (mínimo 3 pontos)"
                    : "Clique em uma zona existente para editar ou inicie o desenho de uma nova zona"}
                </Text>
                
                <Stack
                  direction={["column", "row"]}
                  spacing={4}
                  justify="flex-end"
                >
                  <Button
                    colorScheme={isDrawing ? "red" : "blue"}
                    variant={isDrawing ? "solid" : "outline"}
                    onClick={() => setIsDrawing(!isDrawing)}
                    leftIcon={<span>{isDrawing ? '⏹️' : '✏️'}</span>}
                    w={["100%", "auto"]}
                  >
                    {isDrawing ? 'Parar Desenho' : 'Iniciar Desenho'}
                  </Button>
                  <Button
                    colorScheme="blue"
                    onClick={salvarZona}
                    isDisabled={!currentZona.nome || currentZona.pontos.length < 3}
                    leftIcon={<span>💾</span>}
                    w={["100%", "auto"]}
                  >
                    Salvar Nova Zona
                  </Button>
                </Stack>
              </VStack>
            )}
          </Box>

          <Box 
            flex={1}
            w="100%"
            borderRadius="xl"
            overflow="hidden"
            cursor={isDrawing ? 'crosshair' : editingZona ? 'move' : 'default'}
            boxShadow="sm"
            borderWidth={1}
            borderColor={editingZona ? highlightBorderColor : borderColor}
            minH={["300px", "400px"]}
          >
            <LoadScript googleMapsApiKey={GOOGLE_MAPS_KEY}>
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={mapConfig.center}
                zoom={mapConfig.zoom}
                onClick={handleMapClick}
                onLoad={handleMapLoad}
                options={{
                  mapTypeId: 'hybrid',
                  styles: [
                    {
                      featureType: 'all',
                      elementType: 'labels',
                      stylers: [{ visibility: 'on' }]
                    }
                  ],
                  mapTypeControl: !isMobile,
                  streetViewControl: !isMobile,
                  fullscreenControl: true,
                  zoomControl: true,
                  minZoom: 4,
                  maxZoom: 18,
                  restriction: {
                    latLngBounds: BRASIL_BOUNDS,
                    strictBounds: false
                  }
                }}
              >
                {zonas.map((zona, index) => (
                  <div key={zona.id}>
                    <Polygon
                      paths={zona.pontos}
                      options={{
                        fillColor: colors[index % colors.length],
                        fillOpacity: editingZona?.id === zona.id ? 0.4 : 0.2,
                        strokeColor: colors[index % colors.length],
                        strokeWeight: editingZona?.id === zona.id ? 2.5 : 1.5,
                        clickable: !isDrawing,
                        draggable: false
                      }}
                      onClick={() => handleZonaClick(zona, index)}
                    />
                    {editingZona?.id === zona.id && zona.pontos.map((point, vertexIndex) => (
                      <Marker
                        key={`vertex-${vertexIndex}`}
                        position={point}
                        draggable={true}
                        icon={{
                          path: google.maps.SymbolPath.CIRCLE,
                          scale: 6,
                          fillColor: '#FF0000',
                          fillOpacity: 1,
                          strokeWeight: 2,
                          strokeColor: '#FFFFFF'
                        }}
                        onDragEnd={(e) => handleNewVertexDrag(e, vertexIndex)}
                      />
                    ))}
                    <Marker
                      position={calcularCentro(zona.pontos)}
                      label={{
                        text: zona.nome,
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}
                    />
                  </div>
                ))}
                {currentZona.pontos.length > 0 && (
                  <>
                    <Polygon
                      paths={currentZona.pontos}
                      options={{
                        fillColor: '#2B6CB0',
                        fillOpacity: 0.2,
                        strokeColor: '#2B6CB0',
                        strokeWeight: 2
                      }}
                    />
                    {currentZona.pontos.map((point, vertexIndex) => (
                      <Marker
                        key={`new-vertex-${vertexIndex}`}
                        position={point}
                        draggable={true}
                        icon={{
                          path: google.maps.SymbolPath.CIRCLE,
                          scale: 6,
                          fillColor: '#2B6CB0',
                          fillOpacity: 1,
                          strokeWeight: 2,
                          strokeColor: '#FFFFFF'
                        }}
                        onDragEnd={(e) => handleNewVertexDrag(e, vertexIndex)}
                        onClick={() => handleRemoveVertex(vertexIndex)}
                      />
                    ))}
                    {currentZona.nome && (
                      <Marker
                        position={calcularCentro(currentZona.pontos)}
                        label={{
                          text: currentZona.nome,
                          color: 'white',
                          fontSize: '12px',
                          fontWeight: 'bold'
                        }}
                      />
                    )}
                  </>
                )}
              </GoogleMap>
            </LoadScript>
          </Box>
        </VStack>
      </Container>
    </Box>
  );
} 