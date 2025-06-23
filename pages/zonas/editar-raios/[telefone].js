import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { GoogleMap, LoadScript, Polygon, Circle, Marker, InfoWindow } from '@react-google-maps/api';
import { 
  Box, 
  Heading, 
  Input, 
  Button, 
  Text, 
  useToast, 
  VStack, 
  HStack, 
  Container, 
  useColorMode,
  useColorModeValue,
  useBreakpointValue,
  Grid,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableContainer,
  FormControl,
  FormLabel,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Card,
  CardHeader,
  CardBody,
  IconButton
} from '@chakra-ui/react';
import { 
  MdArrowBack, 
  MdSave, 
  MdAdd,
  MdDelete,
  MdLocationOn
} from 'react-icons/md';
import { supabase } from '../../../lib/supabase';

const GOOGLE_MAPS_KEY = 'AIzaSyD1DL2b2Gy91nOOxiQn5CqlX0fciTER4E0';

const colors = [
  '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#800000', '#008000', '#000080', '#808000', '#800080', '#008080'
];

export default function EditarRaiosPage() {
  const router = useRouter();
  const { telefone } = router.query;
  const { zonaId, zonaNome } = router.query;
  const toast = useToast();
  const isMobile = useBreakpointValue({ base: true, md: false });

  // Valores que mudam com o tema
  const bgColor = useColorModeValue('white', 'gray.900');
  const cardBg = useColorModeValue('white', 'gray.800');
  const textColor = useColorModeValue('gray.700', 'gray.100');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const subtitleColor = useColorModeValue('gray.600', 'gray.400');
  const inputBg = useColorModeValue('white', 'gray.700');

  const [zona, setZona] = useState(null);
  const [pontoDelivery, setPontoDelivery] = useState({ lat: '', lng: '' });
  const [raios, setRaios] = useState([]);
  const [novoRaio, setNovoRaio] = useState({ raio: '', taxa: '', taxaNoturna: '' });

  // Funções para tratamento de valores monetários
  const formatarValor = (valor) => {
    if (!valor) return '';
    return valor.toString().replace('.', ',');
  };

  const parseValor = (valor) => {
    if (!valor) return '';
    return valor.toString().replace(',', '.');
  };
  const [mapInstance, setMapInstance] = useState(null);
  const [windowHeight, setWindowHeight] = useState(0);
  const [hasChanges, setHasChanges] = useState(false);
  const [showNovoRaio, setShowNovoRaio] = useState(false);
  const [renderCircles, setRenderCircles] = useState(true);
  const [showInfoWindow, setShowInfoWindow] = useState(false);

  // Hook para detectar altura da janela
  useEffect(() => {
    const updateHeight = () => {
      setWindowHeight(window.innerHeight);
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Calcula altura do mapa para 70% da altura da tela
  const mapHeight = windowHeight > 0 ? Math.max(windowHeight * 0.7, 500) : 600;

  // Log quando raios mudarem
  useEffect(() => {
    console.log('Raios atualizados:', raios);
    console.log('Número de raios:', raios.length);
  }, [raios]);

  // Força re-renderização dos círculos quando raios mudarem
  useEffect(() => {
    console.log('Forçando atualização dos círculos...');
    setRenderCircles(false);
    const timer = setTimeout(() => {
      setRenderCircles(true);
      console.log('Círculos re-renderizados');
    }, 100);
    
    return () => clearTimeout(timer);
  }, [raios.length]);

  useEffect(() => {
    if (telefone && zonaId) {
      carregarDados();
    }
  }, [telefone, zonaId]);

  const carregarDados = async () => {
    try {
      console.log('Carregando dados para telefone:', telefone, 'zona:', zonaId);
      
      // Carrega dados da zona
      const { data: zonaData, error: zonaError } = await supabase
        .from('zonas_entrega')
        .select('*')
        .eq('id', zonaId)
        .single();

      if (zonaError) throw zonaError;

      if (zonaData) {
        console.log('Dados da zona carregados:', zonaData);
        const zonaFormatada = {
          ...zonaData,
          pontos: Array.isArray(zonaData.pontos) ? zonaData.pontos : JSON.parse(zonaData.pontos)
        };
        setZona(zonaFormatada);
        console.log('Zona formatada:', zonaFormatada);

        // Define centro do mapa baseado na zona ou ponto delivery salvo
        if (zonaData.ponto_delivery_lat && zonaData.ponto_delivery_lng) {
          const coords = { 
            lat: zonaData.ponto_delivery_lat.toString(), 
            lng: zonaData.ponto_delivery_lng.toString() 
          };
          console.log('Usando coordenadas salvas:', coords);
          setPontoDelivery(coords);
        } else if (zonaFormatada.pontos.length > 0) {
          const centro = calcularCentro(zonaFormatada.pontos);
          const coords = { lat: centro.lat.toString(), lng: centro.lng.toString() };
          console.log('Calculando centro da zona:', coords);
          setPontoDelivery(coords);
        }
      }

      // Carrega raios existentes
      const { data: raiosData, error: raiosError } = await supabase
        .from('raios_entrega')
        .select('*')
        .eq('telefone', telefone)
        .eq('zona_id', zonaId)
        .order('raio');

      if (raiosError) throw raiosError;

      console.log('Raios carregados do banco:', raiosData);
      if (raiosData) {
        setRaios(raiosData);
        console.log('Raios definidos no estado:', raiosData);
      }

    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      toast({
        title: "Erro ao carregar dados",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const calcularCentro = (pontos) => {
    if (pontos.length === 0) return { lat: -15.7801, lng: -47.9292 };
    
    const soma = pontos.reduce((acc, ponto) => ({
      lat: acc.lat + ponto.lat,
      lng: acc.lng + ponto.lng
    }), { lat: 0, lng: 0 });

    return {
      lat: soma.lat / pontos.length,
      lng: soma.lng / pontos.length
    };
  };

  const salvarPontoDelivery = async () => {
    if (!pontoDelivery.lat || !pontoDelivery.lng) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha latitude e longitude do ponto de delivery",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('zonas_entrega')
        .update({
          ponto_delivery_lat: parseFloat(pontoDelivery.lat),
          ponto_delivery_lng: parseFloat(pontoDelivery.lng)
        })
        .eq('id', zonaId);

      if (error) throw error;

      toast({
        title: "Ponto de delivery salvo",
        description: "Coordenadas salvas com sucesso",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

      setHasChanges(false);
    } catch (error) {
      console.error('Erro ao salvar ponto de delivery:', error);
      toast({
        title: "Erro ao salvar",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const adicionarRaio = async () => {
    if (!novoRaio.raio || !novoRaio.taxa || !novoRaio.taxaNoturna) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha todos os campos do raio",
        status: "warning",
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    try {
      const { data, error } = await supabase
        .from('raios_entrega')
        .insert({
          telefone,
          zona_id: zonaId,
          raio: parseInt(novoRaio.raio),
          taxa: parseFloat(parseValor(novoRaio.taxa)),
          taxa_noturna: parseFloat(parseValor(novoRaio.taxaNoturna))
        })
        .select()
        .single();

      if (error) throw error;

      const novosRaios = [...raios, data].sort((a, b) => a.raio - b.raio);
      console.log('Adicionando raio:', data);
      console.log('Novos raios:', novosRaios);
      
      // Atualiza os raios e limpa campos
      setRaios(novosRaios);
      setNovoRaio({ raio: '', taxa: '', taxaNoturna: '' });
      setShowNovoRaio(false); // Fecha a seção após adicionar
      console.log('Campos limpos e seção fechada');

      toast({
        title: "Raio adicionado",
        description: "Novo raio de entrega criado com sucesso",
        status: "success",
        duration: 3000,
        isClosable: true,
      });

    } catch (error) {
      console.error('Erro ao adicionar raio:', error);
      toast({
        title: "Erro ao adicionar raio",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const excluirRaio = async (raioId) => {
    try {
      console.log('Excluindo raio ID:', raioId);
      console.log('Raios antes da exclusão:', raios);

      const { error } = await supabase
        .from('raios_entrega')
        .delete()
        .eq('id', raioId);

      if (error) throw error;

      const novosRaios = raios.filter(r => r.id !== raioId);
      console.log('Raios após filtro:', novosRaios);
      
      // Refresh imediato do navegador
      console.log('Raio excluído, fazendo refresh imediato...');
      window.location.reload();

    } catch (error) {
      console.error('Erro ao excluir raio:', error);
      toast({
        title: "Erro ao excluir raio",
        description: error.message,
        status: "error",
        duration: 3000,
        isClosable: true,
      });
    }
  };

  const voltarPagina = () => {
    router.back();
  };

  const handleMapLoad = (map) => {
    setMapInstance(map);
  };

  const getPontoDeliveryCoords = () => {
    if (!pontoDelivery.lat || !pontoDelivery.lng) {
      console.log('Ponto de delivery não definido:', pontoDelivery);
      return null;
    }
    const coords = {
      lat: parseFloat(pontoDelivery.lat),
      lng: parseFloat(pontoDelivery.lng)
    };
    console.log('Coordenadas do ponto de delivery:', coords);
    return coords;
  };

  const getMapCenter = () => {
    const coords = getPontoDeliveryCoords();
    if (coords) {
      console.log('Centro do mapa: ponto de delivery:', coords);
      return coords;
    }
    
    if (zona && zona.pontos.length > 0) {
      const centro = calcularCentro(zona.pontos);
      console.log('Centro do mapa: centro da zona:', centro);
      return centro;
    }
    
    const defaultCenter = { lat: -15.7801, lng: -47.9292 };
    console.log('Centro do mapa: padrão:', defaultCenter);
    return defaultCenter;
  };

  return (
    <Box bg={bgColor} minH="100vh" p={[2, 4]}>
      <Container maxW="container.xl">
        <VStack spacing={[3, 6]} align="stretch">
          {/* Cabeçalho */}
          <Box
            bg={cardBg}
            p={[4, 6]}
            borderRadius="xl"
            borderWidth="1px"
            borderColor={borderColor}
            shadow="lg"
            bgGradient="linear(to-r, purple.50, pink.50)"
            _dark={{
              bgGradient: "linear(to-r, purple.900, pink.900)"
            }}
          >
                        {/* Layout com botão à esquerda e título centralizado */}
            <Grid
              templateColumns="1fr auto 1fr"
              alignItems="center"
              mb={[2, 4]}
              w="100%"
            >
              {/* Botão Voltar à esquerda */}
              <Button
                leftIcon={<MdArrowBack />}
                onClick={voltarPagina}
                variant="outline"
                size={["md", "lg"]}
                justifySelf="start"
              >
                Voltar
              </Button>

              {/* Título centralizado */}
              <VStack spacing={1}>
                <Heading
                  size={["lg", "2xl"]}
                  fontWeight="extrabold"
                  fontFamily="Inter, system-ui, sans-serif"
                  bgGradient="linear(to-r, purple.400, pink.500, red.600)"
                  bgClip="text"
                  letterSpacing="tighter"
                  textAlign="center"
                >
                  Editar Raios de Entrega
                </Heading>
                
                <Text
                  fontSize={["md", "lg"]}
                  color={subtitleColor}
                  fontWeight="medium"
                  textAlign="center"
                  fontFamily="Inter, system-ui, sans-serif"
                >
                  Zona {zonaNome}
                </Text>
              </VStack>

              {/* Espaço vazio à direita para balanceamento */}
              <Box></Box>
            </Grid>
          </Box>

          {/* Ponto de Delivery */}
          <Card>
            <CardHeader>
              <Heading size="md" display="flex" alignItems="center">
                <MdLocationOn style={{ marginRight: '8px' }} />
                Ponto de Delivery
              </Heading>
            </CardHeader>
            <CardBody>
              <VStack spacing={4} align="stretch">
                <Grid templateColumns={["1fr", "1fr 1fr"]} gap={4}>
                  <FormControl>
                    <FormLabel>Latitude</FormLabel>
                    <HStack spacing={2}>
                      <Input
                        type="number"
                        step="any"
                        placeholder="-15.7801"
                        value={pontoDelivery.lat}
                        onChange={(e) => {
                          setPontoDelivery(prev => ({ ...prev, lat: e.target.value }));
                          setHasChanges(true);
                        }}
                        bg={inputBg}
                        flex="1"
                      />
                      <IconButton
                        icon={<MdDelete />}
                        onClick={() => {
                          setPontoDelivery(prev => ({ ...prev, lat: '' }));
                          setHasChanges(true);
                        }}
                        size="md"
                        variant="ghost"
                        colorScheme="gray"
                        aria-label="Limpar latitude"
                      />
                    </HStack>
                  </FormControl>
                  <FormControl>
                    <FormLabel>Longitude</FormLabel>
                    <HStack spacing={2}>
                      <Input
                        type="number"
                        step="any"
                        placeholder="-47.9292"
                        value={pontoDelivery.lng}
                        onChange={(e) => {
                          setPontoDelivery(prev => ({ ...prev, lng: e.target.value }));
                          setHasChanges(true);
                        }}
                        bg={inputBg}
                        flex="1"
                      />
                      <IconButton
                        icon={<MdDelete />}
                        onClick={() => {
                          setPontoDelivery(prev => ({ ...prev, lng: '' }));
                          setHasChanges(true);
                        }}
                        size="md"
                        variant="ghost"
                        colorScheme="gray"
                        aria-label="Limpar longitude"
                      />
                    </HStack>
                  </FormControl>
                </Grid>
                <Button
                  colorScheme="blue"
                  onClick={salvarPontoDelivery}
                  leftIcon={<MdSave />}
                  isDisabled={!hasChanges}
                >
                  Salvar Coordenadas
                </Button>
              </VStack>
            </CardBody>
          </Card>

          {/* Novo Raio */}
          <Card>
            <CardHeader 
              cursor="pointer" 
              onClick={() => setShowNovoRaio(!showNovoRaio)}
              _hover={{ bg: cardBg }}
            >
              <Heading size="md" display="flex" alignItems="center" justifyContent="space-between">
                <Box display="flex" alignItems="center">
                  <MdAdd style={{ marginRight: '8px' }} />
                  Cadastrar Novo Raio
                </Box>
                <Text fontSize="sm" color={subtitleColor}>
                  {showNovoRaio ? '▲ Ocultar' : '▼ Mostrar'}
                </Text>
              </Heading>
            </CardHeader>
            {showNovoRaio && (
              <CardBody>
                <VStack spacing={4} align="stretch">
                  <VStack spacing={4} align="stretch">
                    <FormControl>
                      <FormLabel>Raio (metros)</FormLabel>
                      <HStack spacing={2}>
                        <NumberInput min={1} flex="1" value={novoRaio.raio} onChange={(valueString) => setNovoRaio(prev => ({ ...prev, raio: valueString }))}>
                          <NumberInputField
                            placeholder="1000"
                            bg={inputBg}
                          />
                          <NumberInputStepper>
                            <NumberIncrementStepper />
                            <NumberDecrementStepper />
                          </NumberInputStepper>
                        </NumberInput>
                        <IconButton
                          icon={<MdDelete />}
                          onClick={() => {
                            console.log('Limpando campo raio');
                            setNovoRaio(prev => ({ ...prev, raio: '' }));
                          }}
                          size="md"
                          variant="ghost"
                          colorScheme="gray"
                          aria-label="Limpar raio"
                        />
                      </HStack>
                    </FormControl>
                    <FormControl>
                      <FormLabel>Taxa (R$)</FormLabel>
                      <HStack spacing={2}>
                        <Input
                          type="text"
                          placeholder="5,00"
                          value={formatarValor(novoRaio.taxa)}
                          onChange={(e) => {
                            const valor = e.target.value;
                            // Permite apenas números, vírgula e ponto
                            if (/^[\d,\.]*$/.test(valor)) {
                              setNovoRaio(prev => ({ ...prev, taxa: parseValor(valor) }));
                            }
                          }}
                          bg={inputBg}
                          flex="1"
                        />
                        <IconButton
                          icon={<MdDelete />}
                          onClick={() => {
                            console.log('Limpando campo taxa');
                            setNovoRaio(prev => ({ ...prev, taxa: '' }));
                          }}
                          size="md"
                          variant="ghost"
                          colorScheme="gray"
                          aria-label="Limpar taxa"
                        />
                      </HStack>
                    </FormControl>
                    <FormControl>
                      <FormLabel>Taxa Noturna (R$)</FormLabel>
                      <HStack spacing={2}>
                        <Input
                          type="text"
                          placeholder="7,50"
                          value={formatarValor(novoRaio.taxaNoturna)}
                          onChange={(e) => {
                            const valor = e.target.value;
                            // Permite apenas números, vírgula e ponto
                            if (/^[\d,\.]*$/.test(valor)) {
                              setNovoRaio(prev => ({ ...prev, taxaNoturna: parseValor(valor) }));
                            }
                          }}
                          bg={inputBg}
                          flex="1"
                        />
                        <IconButton
                          icon={<MdDelete />}
                          onClick={() => {
                            console.log('Limpando campo taxa noturna');
                            setNovoRaio(prev => ({ ...prev, taxaNoturna: '' }));
                          }}
                          size="md"
                          variant="ghost"
                          colorScheme="gray"
                          aria-label="Limpar taxa noturna"
                        />
                      </HStack>
                    </FormControl>
                  </VStack>
                  <Button
                    colorScheme="green"
                    onClick={adicionarRaio}
                    leftIcon={<MdAdd />}
                    w="100%"
                  >
                    Adicionar Raio
                  </Button>
                </VStack>
              </CardBody>
            )}
          </Card>

          {/* Lista de Raios */}
          <Card>
            <CardHeader>
              <Heading size="md">Raios Cadastrados</Heading>
            </CardHeader>
            <CardBody>
              <TableContainer>
                <Table variant="simple">
                  <Thead>
                    <Tr>
                      <Th>Raio (m)</Th>
                      <Th>Taxa (R$)</Th>
                      <Th>Taxa Noturna (R$)</Th>
                      <Th>Ações</Th>
                    </Tr>
                  </Thead>
                  <Tbody>
                    {raios.map((raio) => (
                      <Tr key={raio.id}>
                        <Td>{raio.raio}</Td>
                        <Td>R$ {raio.taxa.toFixed(2).replace('.', ',')}</Td>
                        <Td>R$ {raio.taxa_noturna.toFixed(2).replace('.', ',')}</Td>
                        <Td>
                          <IconButton
                            colorScheme="red"
                            size="sm"
                            icon={<MdDelete />}
                            onClick={() => excluirRaio(raio.id)}
                            aria-label="Excluir raio"
                          />
                        </Td>
                      </Tr>
                    ))}
                    {raios.length === 0 && (
                      <Tr>
                        <Td colSpan={4} textAlign="center" color={subtitleColor}>
                          Nenhum raio cadastrado
                        </Td>
                      </Tr>
                    )}
                  </Tbody>
                </Table>
              </TableContainer>
            </CardBody>
          </Card>

          {/* Mapa */}
          <Box
            bg={cardBg}
            borderRadius="lg"
            borderWidth="1px"
            borderColor={borderColor}
            shadow="sm"
            h={`${mapHeight}px`}
            position="relative"
            overflow="hidden"
          >
            <LoadScript googleMapsApiKey={GOOGLE_MAPS_KEY}>
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%' }}
                center={getMapCenter()}
                zoom={13}
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
                  maxZoom: 18
                }}
                onLoad={handleMapLoad}
              >
                {/* Desenha a zona */}
                {zona && (
                  <Polygon
                    paths={zona.pontos}
                    options={{
                      fillColor: '#2B6CB0',
                      fillOpacity: 0.2,
                      strokeColor: '#2B6CB0',
                      strokeWeight: 2,
                      clickable: false,
                      draggable: false,
                      editable: false,
                      geodesic: true
                    }}
                  />
                )}

                {/* Desenha os raios */}
                {renderCircles && getPontoDeliveryCoords() && raios.length > 0 && raios.map((raio, index) => {
                  const center = getPontoDeliveryCoords();
                  console.log(`Renderizando círculo ID: ${raio.id}, centro: ${center.lat}, ${center.lng}, raio: ${raio.raio}m`);
                  return (
                    <Circle
                      key={`circle-${raio.id}-${Date.now()}`}
                      center={center}
                      radius={raio.raio}
                      options={{
                        fillOpacity: 0,
                        strokeColor: colors[index % colors.length],
                        strokeWeight: 2,
                        strokeOpacity: 0.8,
                        clickable: false
                      }}
                    />
                  );
                })}
                
                {!renderCircles && (
                  <div style={{ display: 'none' }}>Atualizando círculos...</div>
                )}

                {/* Marcador do ponto de delivery */}
                {getPontoDeliveryCoords() && (
                  <Marker
                    position={getPontoDeliveryCoords()}
                    title="Ponto de Delivery"
                    icon={{
                      url: 'data:image/svg+xml;base64,' + btoa(`
                        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="#e53e3e">
                          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                        </svg>
                      `),
                      scaledSize: new window.google.maps.Size(32, 32),
                      anchor: new window.google.maps.Point(16, 32)
                    }}
                    onClick={() => setShowInfoWindow(true)}
                  />
                )}

                {/* InfoWindow do ponto de delivery */}
                {getPontoDeliveryCoords() && showInfoWindow && (
                  <InfoWindow
                    position={getPontoDeliveryCoords()}
                    onCloseClick={() => setShowInfoWindow(false)}
                  >
                    <div style={{ padding: '5px', fontFamily: 'Inter, sans-serif' }}>
                      <strong>Ponto de Delivery</strong>
                      <br />
                      <small>
                        Lat: {getPontoDeliveryCoords().lat.toFixed(6)}
                        <br />
                        Lng: {getPontoDeliveryCoords().lng.toFixed(6)}
                      </small>
                    </div>
                  </InfoWindow>
                )}
              </GoogleMap>
            </LoadScript>
          </Box>
        </VStack>
      </Container>
    </Box>
  );
} 